export interface PhoneCountry {
    iso: string;
    name: string;
    dialCode: string;
    flag: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
    { iso: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' }
    // add more later (e.g., US, UK, etc.)
];