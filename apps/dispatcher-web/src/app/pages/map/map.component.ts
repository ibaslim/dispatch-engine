import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';
import { AuthService } from '../../core/auth/auth.service';
import { GoogleMapsService } from '../../services/google-maps/google-maps.service';

declare const google: any;

type RouteOrigin =
  | { location: { latLng: { latitude: number; longitude: number } } }
  | { address: string };

type LatLng = { lat: number; lng: number };

interface RouteStep {
  instruction: string;
  distanceMeters: number;
  endLocation: LatLng;
}

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const STEP_ADVANCE_THRESHOLD_M = 30;
const NEAR_MANEUVER_ANNOUNCE_M = 150;
const CAMERA_ANIMATION_MS = 900;

@Component({
  selector: 'app-map',
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './map.component.html'
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly googleMaps = inject(GoogleMapsService);

  private map: any;
  private routePolyline: any;
  private driverMarker: any;
  private watchId: number | null = null;
  private lastPosition: LatLng | null = null;
  private nearManeuverAnnounced = false;
  private currentStepIndex = 0;

  private animationFrameId: number | null = null;
  private displayedPosition: LatLng | null = null;
  private displayedHeading = 0;

  private destination = '';
  private steps: RouteStep[] = [];

  destinationLabel = '';
  directionsError = '';

  private dragListener: any = null;

  isNavigating = false;
  isRouteReady = false;
  isMuted = false;
  isFollowingDriver = true;
  isRecalculating = false;
  currentInstruction = '';
  distanceToManeuverText = '';
  remainingDistanceText = '';
  totalDurationText = '';

  get isReadOnlyTenant(): boolean {
    return !this.auth.isPlatformAdmin();
  }

  ngOnInit(): void {
    this.destination = this.route.snapshot.queryParamMap.get('destination') || '';
    this.destinationLabel = this.route.snapshot.queryParamMap.get('label') || '';
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.googleMaps.loadMaps();
      this.map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 53.5461, lng: -113.4938 }, // Edmonton
        zoom: 11,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        styles: this.darkStyle
      });

      if (this.destination) {
        this.showDirectionsTo(this.destination);
      }
    } catch {
      this.directionsError = 'Google Maps is not configured or could not be loaded.';
    }
  }

  ngOnDestroy(): void {
    this.stopWatchingPosition();
    this.stopAnimating();
  }

  // ─── Navigation controls ───────────────────────────────────────────────────

  startNavigation(): void {
    if (!this.isRouteReady || !navigator.geolocation) return;

    this.isNavigating = true;
    this.isFollowingDriver = true;
    this.nearManeuverAnnounced = false;
    this.displayedPosition = null;
    this.displayedHeading = 0;
    this.setCurrentStep(0, true);
    this.map.setZoom(18);
    // Default UI controls would rotate/scale with the map's heading-up compass transform, so hide them mid-navigation.
    this.map.setOptions({ disableDefaultUI: true });

    // Dragging the map manually pauses auto-follow until the driver taps "Recenter".
    this.dragListener = this.map.addListener('dragstart', () => {
      if (this.isNavigating) this.isFollowingDriver = false;
    });

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPositionUpdate(pos),
      (err) => console.error('watchPosition error:', err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  stopNavigation(): void {
    this.isNavigating = false;
    this.stopWatchingPosition();
    this.stopAnimating();
    this.setMapRotation(0);
    this.map.setOptions({
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true
    });

    if (this.dragListener) {
      google.maps.event.removeListener(this.dragListener);
      this.dragListener = null;
    }

    if (this.routePolyline) {
      const bounds = new google.maps.LatLngBounds();
      this.routePolyline.getPath().forEach((point: any) => bounds.extend(point));
      this.map.fitBounds(bounds);
    }
  }

  /** Re-centers and re-aligns the camera on the driver after they've manually panned/zoomed away. */
  recenter(): void {
    this.isFollowingDriver = true;
    if (this.displayedPosition) {
      this.map.setCenter(this.displayedPosition);
      this.map.setZoom(18);
      this.setMapRotation(-this.displayedHeading);
    }
  }

  /** Recalculates the route from the driver's current position — use if they've gone off the planned path. */
  recalculateRoute(): void {
    if (!navigator.geolocation || this.isRecalculating) return;
    this.isRecalculating = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const origin: RouteOrigin = {
          location: { latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }
        };
        await this.computeRoute(origin, this.destination);
        this.nearManeuverAnnounced = false;
        if (this.steps.length) {
          this.setCurrentStep(0, true);
        }
        this.isRecalculating = false;
      },
      () => { this.isRecalculating = false; },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  toggleMute(): void {
    this.isMuted = !this.isMuted;
    if (this.isMuted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private stopWatchingPosition(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private setCurrentStep(index: number, speak: boolean): void {
    this.currentStepIndex = index;
    const step = this.steps[index];
    if (!step) return;

    this.currentInstruction = step.instruction;
    this.distanceToManeuverText = this.formatDistance(step.distanceMeters);
    this.nearManeuverAnnounced = false;

    if (speak) {
      this.speak(step.instruction);
    }
  }

  // ─── Live position handling ────────────────────────────────────────────────

  private onPositionUpdate(pos: GeolocationPosition): void {
    const current: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const heading = pos.coords.heading ?? (this.lastPosition ? this.bearingBetween(this.lastPosition, current) : this.displayedHeading);
    this.lastPosition = current;

    // Step completion uses the raw GPS fix immediately — accuracy matters more than smoothness here.
    this.advanceStepIfNeeded(current);

    this.animateTo(current, heading);
  }

  /** Glides the marker/camera from the last displayed position to the new GPS fix over CAMERA_ANIMATION_MS,
   *  instead of snapping — watchPosition fixes can arrive many seconds apart, especially on non-GPS hardware. */
  private animateTo(target: LatLng, targetHeading: number): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const start = this.displayedPosition ?? target;
    const startHeading = this.displayedHeading;
    const headingDelta = this.shortestAngleDelta(startHeading, targetHeading);
    const startTime = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / CAMERA_ANIMATION_MS);
      const eased = t * (2 - t); // ease-out

      const position: LatLng = {
        lat: start.lat + (target.lat - start.lat) * eased,
        lng: start.lng + (target.lng - start.lng) * eased
      };
      const heading = startHeading + headingDelta * eased;

      this.displayedPosition = position;
      this.displayedHeading = heading;

      this.updateDriverMarker(position);
      if (this.isFollowingDriver) {
        this.map.setCenter(position);
        this.setMapRotation(-heading);
      }

      this.animationFrameId = t < 1 ? requestAnimationFrame(step) : null;
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  private stopAnimating(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private shortestAngleDelta(from: number, to: number): number {
    let delta = (to - from) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  private updateDriverMarker(position: LatLng): void {
    if (!this.driverMarker) {
      this.driverMarker = new google.maps.Marker({
        map: this.map,
        position,
        icon: {
          path: 'M 0,-9 L 6,8 L 0,4 L -6,8 Z',
          fillColor: '#3ddc97',
          fillOpacity: 1,
          strokeColor: '#0b3d2e',
          strokeWeight: 1.5,
          scale: 1.8,
          anchor: new google.maps.Point(0, 0)
        },
        zIndex: 999
      });
    } else {
      this.driverMarker.setPosition(position);
    }
  }

  private advanceStepIfNeeded(current: LatLng): void {
    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    const distToEnd = this.haversineMeters(current, step.endLocation);
    const isLastStep = this.currentStepIndex === this.steps.length - 1;

    if (isLastStep && distToEnd < STEP_ADVANCE_THRESHOLD_M) {
      this.currentInstruction = 'You have arrived at your destination';
      this.distanceToManeuverText = '';
      this.speak(this.currentInstruction);
      this.stopNavigation();
      return;
    }

    if (!isLastStep && distToEnd < STEP_ADVANCE_THRESHOLD_M) {
      this.setCurrentStep(this.currentStepIndex + 1, true);
      return;
    }

    this.distanceToManeuverText = this.formatDistance(distToEnd);

    if (!this.nearManeuverAnnounced && !isLastStep && distToEnd < NEAR_MANEUVER_ANNOUNCE_M) {
      this.nearManeuverAnnounced = true;
      this.speak(`In ${this.formatDistance(distToEnd)}, ${this.steps[this.currentStepIndex + 1]?.instruction ?? step.instruction}`);
    }

    let remaining = distToEnd;
    for (let i = this.currentStepIndex + 1; i < this.steps.length; i++) {
      remaining += this.steps[i].distanceMeters;
    }
    this.remainingDistanceText = this.formatDistance(remaining);
  }

  private setMapRotation(deg: number): void {
    const el = document.getElementById('map');
    if (!el) return;
    el.style.transformOrigin = '50% 50%';
    el.style.transform = this.isNavigating ? `rotate(${deg}deg) scale(1.6)` : '';
  }

  private speak(text: string): void {
    if (this.isMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  // ─── Directions ─────────────────────────────────────────────────────────────

  private showDirectionsTo(destination: string): void {
    if (!navigator.geolocation) {
      this.centerOnDestination(destination);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.computeRoute(
          { location: { latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } } },
          destination
        );
      },
      () => this.centerOnDestination(destination)
    );
  }

  private async computeRoute(origin: RouteOrigin, destination: string): Promise<void> {
    try {
      const apiKey = await this.googleMaps.getBrowserApiKey();
      const response = await fetch(ROUTES_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'routes.duration',
            'routes.distanceMeters',
            'routes.polyline.encodedPolyline',
            'routes.legs.steps.navigationInstruction',
            'routes.legs.steps.distanceMeters',
            'routes.legs.steps.endLocation'
          ].join(',')
        },
        body: JSON.stringify({
          origin,
          destination: { address: destination },
          travelMode: 'DRIVE'
        })
      });

      const data = await response.json().catch(() => null);
      const routeData = data?.routes?.[0];
      const encodedPolyline = routeData?.polyline?.encodedPolyline;

      if (!encodedPolyline) {
        console.error(`Routes API returned no route: HTTP ${response.status}`, data);
        this.directionsError = data?.error?.message || `No route found (HTTP ${response.status}).`;
        this.centerOnDestination(destination);
        return;
      }

      const path = this.decodePolyline(encodedPolyline);

      this.routePolyline?.setMap(null);
      this.routePolyline = new google.maps.Polyline({
        path,
        map: this.map,
        strokeColor: '#3ddc97',
        strokeWeight: 5
      });

      const bounds = new google.maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      this.map.fitBounds(bounds);

      this.steps = (routeData.legs?.[0]?.steps ?? []).map((step: any): RouteStep => ({
        instruction: step.navigationInstruction?.instructions || 'Continue',
        distanceMeters: step.distanceMeters ?? 0,
        endLocation: {
          lat: step.endLocation?.latLng?.latitude,
          lng: step.endLocation?.latLng?.longitude
        }
      }));

      const totalSeconds = parseInt(String(routeData.duration || '0').replace('s', ''), 10) || 0;
      this.totalDurationText = this.formatDuration(totalSeconds);
      this.remainingDistanceText = this.formatDistance(routeData.distanceMeters ?? 0);
      this.isRouteReady = this.steps.length > 0;
    } catch (err) {
      console.error('Routes API request failed:', err);
      this.directionsError = 'Unable to load directions.';
      this.centerOnDestination(destination);
    }
  }

  private centerOnDestination(destination: string): void {
    new google.maps.Geocoder().geocode({ address: destination }, (results: any, status: string) => {
      if (status === 'OK' && results?.[0]) {
        this.map.setCenter(results[0].geometry.location);
        this.map.setZoom(14);
        new google.maps.Marker({ map: this.map, position: results[0].geometry.location });
      } else {
        console.error('Geocoder failed:', status);
        this.directionsError = this.directionsError || `Unable to locate address (${status}).`;
      }
    });
  }

  // ─── Geometry helpers ───────────────────────────────────────────────────────

  private haversineMeters(a: LatLng, b: LatLng): number {
    const R = 6371000;
    const dLat = this.toRad(b.lat - a.lat);
    const dLng = this.toRad(b.lng - a.lng);
    const lat1 = this.toRad(a.lat);
    const lat2 = this.toRad(b.lat);

    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private bearingBetween(a: LatLng, b: LatLng): number {
    const lat1 = this.toRad(a.lat);
    const lat2 = this.toRad(b.lat);
    const dLng = this.toRad(b.lng - a.lng);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (this.toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  private toDeg(rad: number): number {
    return (rad * 180) / Math.PI;
  }

  private formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  private formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  private decodePolyline(encoded: string): LatLng[] {
    const points: LatLng[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points;
  }

  darkStyle = [
    { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
    { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }
  ];
}
