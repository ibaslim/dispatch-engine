import { Injectable, signal } from '@angular/core';

import { DailyPaymentRow } from '../../models/drivers/daily-payment.model';
import { DriverRow } from '../../models/drivers/drivers-list.model';
import { DriverEntity, DriverFormValue, DriverStatus } from '../../models/drivers/driver.model';

const DRIVERS_STORAGE_KEY = 'dispatch:drivers:demo';
const ASSIGNMENTS_STORAGE_KEY = 'dispatch:drivers:assignments';

type DriverAssignmentMap = Record<string, string>;

@Injectable({ providedIn: 'root' })
export class DemoDriversService {
  private readonly driversState = signal<DriverEntity[]>(this.readDrivers());
  private readonly assignmentsState = signal<DriverAssignmentMap>(this.readAssignments());

  readonly drivers = this.driversState.asReadonly();
  readonly assignments = this.assignmentsState.asReadonly();

  listDrivers(): DriverEntity[] {
    return this.driversState();
  }

  seedDrivers(): DriverEntity[] {
    const seededDrivers = this.buildSeedDrivers();
    const nextDrivers = seededDrivers;
    this.driversState.set(nextDrivers);
    this.persistDrivers(nextDrivers);
    this.pruneAssignments(nextDrivers.map((driver) => driver.id));
    return nextDrivers;
  }

  resetDemoState(): void {
    this.driversState.set([]);
    this.assignmentsState.set({});

    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(DRIVERS_STORAGE_KEY);
    localStorage.removeItem(ASSIGNMENTS_STORAGE_KEY);
  }

  saveDriverFromForm(value: DriverFormValue, id?: string): DriverEntity {
    const nextDriver: DriverEntity = {
      id: id ?? crypto.randomUUID(),
      name: value.name.trim(),
      email: value.email.trim(),
      phoneCountryCode: value.phone.countryCode,
      phoneNumber: value.phone.number,
      vehicle: value.vehicle.trim(),
      rating: this.toNumber(value.rating),
      status: value.status,
      completedDeliveries: Math.round(this.toNumber(value.completedDeliveries)),
      basePay: this.toNumber(value.basePay),
      tips: this.toNumber(value.tips),
      adjustments: this.toNumber(value.adjustments)
    };

    const nextDrivers = this.upsertDriver(nextDriver);
    this.persistDrivers(nextDrivers);
    return nextDriver;
  }

  assignDriver(orderId: string, driverId: string): void {
    const nextAssignments = {
      ...this.assignmentsState(),
      [orderId]: driverId
    };
    this.assignmentsState.set(nextAssignments);
    this.persistAssignments(nextAssignments);
  }

  unassignDriver(orderId: string): void {
    const nextAssignments = { ...this.assignmentsState() };
    delete nextAssignments[orderId];
    this.assignmentsState.set(nextAssignments);
    this.persistAssignments(nextAssignments);
  }

  getAssignedDriver(orderId: string): DriverEntity | null {
    const driverId = this.assignmentsState()[orderId];
    if (!driverId) return null;
    return this.findDriverById(driverId);
  }

  findDriverById(driverId: string): DriverEntity | null {
    return this.driversState().find((driver) => driver.id === driverId) ?? null;
  }

  toDriverRows(query: string): DriverRow[] {
    return this.filterDrivers(query).map((driver) => ({
      id: driver.id,
      name: driver.name,
      rating: driver.rating.toFixed(1),
      phone: `${driver.phoneCountryCode}${driver.phoneNumber}`,
      email: driver.email,
      vehicle: driver.vehicle,
      status: driver.status
    }));
  }

  toDailyPaymentRows(query: string): DailyPaymentRow[] {
    return this.filterDrivers(query).map((driver) => {
      const assignedCount = Object.values(this.assignmentsState()).filter((driverId) => driverId === driver.id).length;
      const completed = Math.max(driver.completedDeliveries, assignedCount);
      const paymentDue = driver.basePay + driver.tips + driver.adjustments;

      return {
        name: driver.name,
        phone: `${driver.phoneCountryCode}${driver.phoneNumber}`,
        completed: String(completed),
        basePay: this.money(driver.basePay),
        tips: this.money(driver.tips),
        shiftEarning: this.money(driver.basePay + driver.tips),
        adjustments: this.money(driver.adjustments),
        paymentDue: this.money(paymentDue)
      };
    });
  }

  createDefaultDriverFormValue(): DriverFormValue {
    return {
      name: '',
      email: '',
      phone: {
        countryCode: '+1',
        number: ''
      },
      vehicle: '',
      rating: '4.8',
      status: 'On Duty',
      completedDeliveries: '0',
      basePay: '120',
      tips: '18',
      adjustments: '0'
    };
  }

  createDummyDriverFormValue(): DriverFormValue {
    const sample = this.buildRandomDriver(this.listDrivers().length + 1);
    return {
      name: sample.name,
      email: sample.email,
      phone: {
        countryCode: sample.phoneCountryCode,
        number: sample.phoneNumber
      },
      vehicle: sample.vehicle,
      rating: sample.rating.toFixed(1),
      status: sample.status,
      completedDeliveries: String(sample.completedDeliveries),
      basePay: String(sample.basePay),
      tips: String(sample.tips),
      adjustments: String(sample.adjustments)
    };
  }

  getDriverStatusOptions(): Array<{ label: DriverStatus; value: DriverStatus }> {
    return [
      { label: 'On Duty', value: 'On Duty' },
      { label: 'Off Duty', value: 'Off Duty' },
      { label: 'On Delivery', value: 'On Delivery' }
    ];
  }

  private filterDrivers(query: string): DriverEntity[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return this.driversState();

    return this.driversState().filter((driver) =>
      driver.name.toLowerCase().includes(normalizedQuery) ||
      driver.email.toLowerCase().includes(normalizedQuery) ||
      `${driver.phoneCountryCode}${driver.phoneNumber}`.toLowerCase().includes(normalizedQuery) ||
      driver.vehicle.toLowerCase().includes(normalizedQuery)
    );
  }

  private upsertDriver(driver: DriverEntity): DriverEntity[] {
    const nextDrivers = [...this.driversState()];
    const index = nextDrivers.findIndex((item) => item.id === driver.id);

    if (index === -1) {
      nextDrivers.unshift(driver);
    } else {
      nextDrivers[index] = driver;
    }

    this.driversState.set(nextDrivers);
    return nextDrivers;
  }

  private persistDrivers(drivers: DriverEntity[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(drivers));
  }

  private persistAssignments(assignments: DriverAssignmentMap): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
  }

  private readDrivers(): DriverEntity[] {
    if (typeof localStorage === 'undefined') return [];

    const raw = localStorage.getItem(DRIVERS_STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as DriverEntity[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private readAssignments(): DriverAssignmentMap {
    if (typeof localStorage === 'undefined') return {};

    const raw = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw) as DriverAssignmentMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private pruneAssignments(validDriverIds: string[]): void {
    const validIds = new Set(validDriverIds);
    const nextAssignments = Object.fromEntries(
      Object.entries(this.assignmentsState()).filter(([, driverId]) => validIds.has(driverId))
    );

    this.assignmentsState.set(nextAssignments);
    this.persistAssignments(nextAssignments);
  }

  private buildSeedDrivers(): DriverEntity[] {
    return [
      {
        id: 'demo-driver-1',
        name: 'Ayesha Malik',
        email: 'ayesha.malik@dispatch.local',
        phoneCountryCode: '+1',
        phoneNumber: '6475551101',
        vehicle: 'Honda Civic',
        rating: 4.9,
        status: 'On Duty',
        completedDeliveries: 18,
        basePay: 145,
        tips: 28,
        adjustments: 5
      },
      {
        id: 'demo-driver-2',
        name: 'Bilal Khan',
        email: 'bilal.khan@dispatch.local',
        phoneCountryCode: '+1',
        phoneNumber: '6475551102',
        vehicle: 'Toyota Prius',
        rating: 4.7,
        status: 'On Delivery',
        completedDeliveries: 24,
        basePay: 162,
        tips: 31,
        adjustments: -4
      },
      {
        id: 'demo-driver-3',
        name: 'Sara Ahmed',
        email: 'sara.ahmed@dispatch.local',
        phoneCountryCode: '+1',
        phoneNumber: '6475551103',
        vehicle: 'Hyundai Elantra',
        rating: 4.8,
        status: 'Off Duty',
        completedDeliveries: 12,
        basePay: 98,
        tips: 14,
        adjustments: 0
      },
      {
        id: 'demo-driver-4',
        name: 'Daniel Brooks',
        email: 'daniel.brooks@dispatch.local',
        phoneCountryCode: '+1',
        phoneNumber: '6475551104',
        vehicle: 'Ford Transit',
        rating: 4.6,
        status: 'On Duty',
        completedDeliveries: 27,
        basePay: 188,
        tips: 36,
        adjustments: 8
      },
      {
        id: 'demo-driver-5',
        name: 'Nadia Sheikh',
        email: 'nadia.sheikh@dispatch.local',
        phoneCountryCode: '+1',
        phoneNumber: '6475551105',
        vehicle: 'Kia Soul',
        rating: 4.9,
        status: 'On Duty',
        completedDeliveries: 20,
        basePay: 152,
        tips: 25,
        adjustments: 3
      }
    ];
  }

  private buildRandomDriver(index: number): DriverEntity {
    const names = ['Zara Ali', 'Omar Siddiqui', 'Mina Joseph', 'Ryan Cole', 'Noor Hassan'];
    const vehicles = ['Nissan Sentra', 'Mazda 3', 'Tesla Model 3', 'Toyota Corolla', 'Volkswagen Jetta'];
    const statuses: DriverStatus[] = ['On Duty', 'Off Duty', 'On Delivery'];
    const name = names[index % names.length] ?? 'Demo Driver';
    const emailSlug = name.toLowerCase().replace(/\s+/g, '.');

    return {
      id: crypto.randomUUID(),
      name,
      email: `${emailSlug}.${Date.now()}@dispatch.local`,
      phoneCountryCode: '+1',
      phoneNumber: `647555${String(2000 + index).slice(-4)}`,
      vehicle: vehicles[index % vehicles.length] ?? 'Sedan',
      rating: 4.5 + ((index % 5) / 10),
      status: statuses[index % statuses.length] ?? 'On Duty',
      completedDeliveries: 8 + index,
      basePay: 110 + (index * 6),
      tips: 10 + (index * 2),
      adjustments: index % 2 === 0 ? 0 : 3
    };
  }

  private toNumber(value: string): number {
    const parsed = parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private money(amount: number): string {
    return `C$ ${amount.toFixed(2)}`;
  }
}
