"""
Location seeder – seeds a compact but meaningful world geography dataset.
Countries → States → Cities hierarchy.
Runs idempotently: skips if any Country already exists.
"""

import logging
from sqlalchemy import select, func
from app.db.session import async_session_factory
from app.db.canada_official_cities import CANADIAN_PROVINCES_AND_CITIES
from app.models.location import (
    City,
    CityPricing,
    Country,
    GlobalPricing,
    State,
    StatePricing,
)

logger = logging.getLogger(__name__)

# ─── Data ─────────────────────────────────────────────────────────────────────
# Structure: { country_name: (code, { state_name: [city1, city2, ...] }) }
GEO_DATA: dict[str, tuple[str, dict[str, list[str]]]] = {
    "United States": ("US", {
        "California": ["Los Angeles", "San Francisco", "San Diego", "Sacramento", "San Jose", "Fresno", "Long Beach", "Oakland"],
        "Texas": ["Houston", "Austin", "Dallas", "San Antonio", "Fort Worth", "El Paso", "Arlington", "Plano"],
        "New York": ["New York City", "Buffalo", "Rochester", "Syracuse", "Albany", "Yonkers", "White Plains"],
        "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "Tallahassee", "St. Petersburg"],
        "Illinois": ["Chicago", "Aurora", "Rockford", "Joliet", "Naperville", "Springfield", "Peoria"],
        "Washington": ["Seattle", "Spokane", "Tacoma", "Bellevue", "Renton", "Kirkland", "Redmond"],
        "Georgia": ["Atlanta", "Augusta", "Columbus", "Savannah", "Athens", "Macon", "Roswell"],
        "Ohio": ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton", "Parma"],
    }),
    "United Kingdom": ("GB", {
        "England": ["London", "Birmingham", "Manchester", "Leeds", "Sheffield", "Liverpool", "Bristol", "Leicester", "Newcastle"],
        "Scotland": ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness", "Stirling"],
        "Wales": ["Cardiff", "Swansea", "Newport", "Wrexham", "Barry", "Neath"],
        "Northern Ireland": ["Belfast", "Derry", "Lisburn", "Newry", "Armagh", "Bangor"],
    }),
    "United Arab Emirates": ("AE", {
        "Dubai": ["Dubai", "Jebel Ali", "Al Quoz", "Deira", "Bur Dubai", "Jumeirah", "Al Nahda"],
        "Abu Dhabi": ["Abu Dhabi", "Al Ain", "Khalifa City", "Mohammed Bin Zayed City", "Musaffah", "Ruwais"],
        "Sharjah": ["Sharjah City", "Khor Fakkan", "Dhaid", "Kalba", "Al Hamriyah"],
        "Ajman": ["Ajman City", "Masfout", "Manama"],
        "Ras Al Khaimah": ["Ras Al Khaimah City", "Al Nakheel", "Dafan Al Nakheel", "Khuzam"],
        "Fujairah": ["Fujairah City", "Dibba Al Fujairah", "Kalba", "Khor Fakkan"],
        "Umm Al Quwain": ["Umm Al Quwain City", "Al Sinniyah Island"],
    }),
    "Saudi Arabia": ("SA", {
        "Riyadh": ["Riyadh", "Al Kharj", "Dawadmi", "Shaqra", "Diriyah"],
        "Makkah": ["Mecca", "Jeddah", "Ta'if", "Rabigh", "Bahra"],
        "Madinah": ["Medina", "Yanbu", "Al Ula", "Badr", "Khaybar"],
        "Eastern Province": ["Dammam", "Al Khobar", "Dhahran", "Jubail", "Qatif", "Hafar Al Batin"],
        "Asir": ["Abha", "Khamis Mushait", "Bisha", "Tathlith", "Sarat Abida"],
        "Tabuk": ["Tabuk", "Al Wajh", "Duba", "Umluj"],
    }),
    "Pakistan": ("PK", {
        "Punjab": ["Lahore", "Faisalabad", "Rawalpindi", "Gujranwala", "Multan", "Sialkot", "Sargodha", "Bahawalpur"],
        "Sindh": ["Karachi", "Hyderabad", "Sukkur", "Larkana", "Mirpurkhas", "Nawabshah"],
        "Khyber Pakhtunkhwa": ["Peshawar", "Mardan", "Mingora", "Kohat", "Abbottabad", "Mansehra"],
        "Balochistan": ["Quetta", "Turbat", "Khuzdar", "Chaman", "Hub", "Gwadar"],
        "Islamabad Capital Territory": ["Islamabad"],
    }),
    "India": ("IN", {
        "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Solapur", "Amravati"],
        "Delhi": ["New Delhi", "Noida", "Gurugram", "Faridabad", "Ghaziabad"],
        "Karnataka": ["Bengaluru", "Mysuru", "Hubli", "Mangaluru", "Belagavi", "Kalaburagi"],
        "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tiruppur"],
        "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
        "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar"],
    }),
    "Australia": ("AU", {
        "New South Wales": ["Sydney", "Newcastle", "Wollongong", "Central Coast", "Parramatta", "Penrith"],
        "Victoria": ["Melbourne", "Geelong", "Ballarat", "Bendigo", "Shepparton", "Wodonga"],
        "Queensland": ["Brisbane", "Gold Coast", "Sunshine Coast", "Townsville", "Cairns", "Toowoomba"],
        "Western Australia": ["Perth", "Fremantle", "Bunbury", "Geraldton", "Kalgoorlie", "Albany"],
        "South Australia": ["Adelaide", "Mount Gambier", "Whyalla", "Murray Bridge"],
    }),
    "Canada": ("CA", CANADIAN_PROVINCES_AND_CITIES),
}


async def seed_locations() -> None:
    """Seed countries, states, and cities from built-in dataset. Idempotent."""
    async with async_session_factory() as db:
        count = await db.scalar(select(func.count()).select_from(Country))
        if count and count > 0:
            logger.info("[seed:locations] Geography data already exists – skipping.")
            return

        logger.info("[seed:locations] Seeding geography data…")
        total_countries = 0
        total_states = 0
        total_cities = 0

        for country_name, (code, states_data) in GEO_DATA.items():
            country = Country(name=country_name, code=code)
            db.add(country)
            await db.flush()
            total_countries += 1

            for state_name, cities in states_data.items():
                state = State(name=state_name, country_id=country.id)
                db.add(state)
                await db.flush()
                total_states += 1

                for city_name in cities:
                    db.add(City(name=city_name, state_id=state.id))
                    total_cities += 1

        await db.commit()
        logger.info(
            "[seed:locations] ✅ Seeded %d countries, %d states, %d cities.",
            total_countries, total_states, total_cities,
        )


async def seed_canadian_pricing() -> None:
    """Ensure every seeded Canadian province and city starts at CAD 2 per unit."""
    async with async_session_factory() as db:
        global_pricing = await db.scalar(
            select(GlobalPricing).where(GlobalPricing.key == "canada")
        )
        if global_pricing is None:
            db.add(GlobalPricing(
                key="canada",
                partner_price_per_km=2.0,
                partner_price_per_kg=2.0,
                individual_price_per_km=2.0,
                individual_price_per_kg=2.0,
            ))

        canada = await db.scalar(select(Country).where(Country.code == "CA"))
        if canada is None:
            canada = Country(name="Canada", code="CA")
            db.add(canada)
            await db.flush()

        _, canadian_states = GEO_DATA["Canada"]
        for state_name, city_names in canadian_states.items():
            state = await db.scalar(
                select(State).where(
                    State.country_id == canada.id,
                    State.name == state_name,
                )
            )
            if state is None:
                state = State(name=state_name, country_id=canada.id)
                db.add(state)
                await db.flush()

            existing_city_names = set((await db.scalars(
                select(City.name).where(City.state_id == state.id)
            )).all())
            for city_name in city_names:
                if city_name not in existing_city_names:
                    db.add(City(name=city_name, state_id=state.id))

        await db.flush()
        result = await db.execute(
            select(State)
            .join(Country)
            .where(Country.code == "CA")
        )
        states = result.scalars().all()

        for state in states:
            state_pricing = await db.scalar(
                select(StatePricing).where(StatePricing.state_id == state.id)
            )
            if state_pricing is None:
                db.add(StatePricing(
                    state_id=state.id,
                    partner_price_per_km=2.0,
                    partner_price_per_kg=2.0,
                    individual_price_per_km=2.0,
                    individual_price_per_kg=2.0,
                ))

            city_result = await db.execute(select(City).where(City.state_id == state.id))
            for city in city_result.scalars().all():
                city_pricing = await db.scalar(
                    select(CityPricing).where(CityPricing.city_id == city.id)
                )
                if city_pricing is None:
                    db.add(CityPricing(
                        city_id=city.id,
                        partner_price_per_km=2.0,
                        partner_price_per_kg=2.0,
                        individual_price_per_km=2.0,
                        individual_price_per_kg=2.0,
                    ))

        await db.commit()
        logger.info("[seed:pricing] Canadian default pricing is ready.")
