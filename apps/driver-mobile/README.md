# Driver Mobile App (`driver-mobile`)

Driver-facing mobile app for the dispatch engine built with **Expo SDK 55 + React Native 0.83**.

---

## ⚠️ Important Note: Custom Development Client Required

This app uses native libraries (including `@react-native-firebase/app` and `@react-native-firebase/messaging`). **It is NOT compatible with the generic Expo Go app** from the Play Store. 

To run the application on an emulator or physical device, you must build and install the custom **Development Client** using **`npx expo run:android`**.

---

## Prerequisites

Before starting, ensure you have installed:
- **Node.js 20.x** & **npm 10.x**
- **Android Studio** with:
  - Android SDK & SDK Platform-Tools (`adb`)
  - Android NDK & CMake
  - Environment variable `ANDROID_HOME` or `ANDROID_SDK_ROOT` set in system environment.
- Active backend API running (e.g. `docker compose up -d` at project root).

---

## Detailed Guide: Building & Starting the App

### 1. Running on Android Emulator

1. **Navigate to the app directory**:
   ```bash
   cd apps/driver-mobile
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Set `EXPO_PUBLIC_API_BASE_URL` in `.env` to point to the host machine via the emulator's loopback IP:
   ```ini
   EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
   ```
   *(Note: `10.0.2.2` is Android Emulator's special alias to host computer's `localhost`)*.

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Launch Android Emulator**:
   Start your Android Virtual Device (AVD) from Android Studio Device Manager, or via CLI:
   ```bash
   emulator -avd <YOUR_AVD_NAME>
   ```

5. **Build and Install on Emulator**:
   Run the native build command:
   ```bash
   npx expo run:android
   ```
   *(Alternative: `npm run android`)*

   **What this command does:**
   - Prebuilds the native Android project structure.
   - Compiles native C++/Java dependencies.
   - Builds the development APK.
   - Installs the app onto your running emulator.
   - Starts the Metro Bundler server automatically.

6. **Subsequent Daily Starts**:
   Once the APK is already installed on the emulator, you do not need to recompile native code every time. Simply run:
   ```bash
   npx expo start --dev-client
   ```
   *(Alternative on Windows PowerShell: `npm start`)*

---

### 2. Running on Physical Device (Android)

#### Prerequisites & Wireless / USB Debugging Setup

1. **Connect to Same Wi-Fi**:
   Ensure both your Android phone and PC are connected to the **SAME Wi-Fi network**.

2. **Enable Developer Options**:
   Go to **Settings > About Phone** on your phone and tap **Build Number** 7 times until Developer Options are enabled.

---

#### Option A: Wireless Debugging (Android 11+) — No USB Cable Needed

1. **Turn on Wireless Debugging**:
   - Go to **Settings > System > Developer Options**.
   - Scroll down to **Wireless Debugging** and toggle it **ON**.
   - Tap **Wireless Debugging** (the text itself) to enter its settings menu.

2. **Pairing your Device with PC**:
   - In Wireless Debugging settings, tap **Pair device with pairing code**.
   - A dialog will display:
     - **Wi-Fi Pairing Code** (e.g. `123456`)
     - **IP address & Port** (e.g. `192.168.1.50:38243`)
   - Open terminal on your PC and run:
     ```bash
     adb pair 192.168.1.50:38243
     ```
     *(Replace `192.168.1.50:38243` with the IP & pairing port shown on your phone screen)*.
   - Enter the 6-digit pairing code when prompted in the terminal.

3. **Connecting ADB Wirelessly**:
   - Look at the main **Wireless Debugging** screen on your phone under **IP address & Port** (note: this connect port is different from the pairing port above, e.g. `192.168.1.50:41235`).
   - Run the connect command in your PC terminal:
     ```bash
     adb connect 192.168.1.50:41235
     ```
   - Verify connection:
     ```bash
     adb devices
     ```
     *(Your phone should be listed as `192.168.1.50:41235 device`)*.

---

#### Option B: USB Cable Connection or Legacy Wireless Setup (Android 10 & older)

1. **USB Cable Setup**:
   - Enable **USB Debugging** in Developer Options.
   - Plug phone into PC via USB cable. Accept the *"Allow USB Debugging"* prompt on phone.
   - Verify: `adb devices`.

2. **Switching to Wireless mode via USB (TCP/IP)**:
   - With USB cable plugged in, set adb to listen on TCP/IP port 5555:
     ```bash
     adb tcpip 5555
     ```
   - Disconnect the USB cable.
   - Find phone IP (Settings > About Phone > Status > IP Address).
   - Connect wirelessly:
     ```bash
     adb connect 192.168.1.x:5555
     ```

---

#### Building & Launching on Connected Device

1. **Navigate & Install Dependencies**:
   ```bash
   cd apps/driver-mobile
   npm install
   ```

2. **API IP Resolution**:
   - Running `npm start` or `npx expo run:android` automatically triggers `scripts/update-ip.js` to set your PC's LAN IP in `.env` (`EXPO_PUBLIC_API_BASE_URL=http://<YOUR_LAN_IP>:8000`).

3. **Build and Install Wirelessly**:
   Compile and install the custom dev client directly over Wi-Fi onto your phone:
   ```bash
   npx expo run:android
   ```

4. **Subsequent Daily Starts**:
   ```bash
   npx expo start --dev-client
   ```

---

## How to Rebuild with Clean Cache

When encountering Metro bundler cache corruption, file resolution errors, or updated native configuration:

### 1. Clear Metro JS Cache
Clear the JavaScript bundler file-map and dependency graph cache:
```bash
npx expo start --dev-client -c
```
*(Or `npm start -- -c`)*

### 2. Rebuild Native Android App with Clean Cache
To clear build caches and force a fresh native compilation when rebuilding with `npx expo run:android`:
```bash
npx expo run:android --no-build-cache
```

---

## Daily Command Summary

| Action | Command |
|---|---|
| **Build & Install Native App** | `npx expo run:android` |
| **Start Metro Bundler (Daily)** | `npx expo start --dev-client` |
| **Start Metro with Clean Cache** | `npx expo start --dev-client -c` |
| **Clean Native Rebuild** | `npx expo run:android --no-build-cache` |
| **Run Linting** | `npm run lint` |
| **Run Tests** | `npm test` |
