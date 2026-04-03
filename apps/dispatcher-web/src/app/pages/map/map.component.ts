import { CommonModule } from '@angular/common';
import { AfterViewInit, Component } from '@angular/core';
import { PageComponent } from '../../components/page/page.component';
import { ButtonComponent } from '../../components/button/button.component';

declare const google: any;

@Component({
  selector: 'app-map',
  imports: [CommonModule, PageComponent, ButtonComponent],
  templateUrl: './map.component.html'
})
export class MapComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    new google.maps.Map(document.getElementById('map'), {
      center: { lat: 53.5461, lng: -113.4938 }, // Edmonton
      zoom: 11,
      disableDefaultUI: true,
      styles: this.darkStyle
    });
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
