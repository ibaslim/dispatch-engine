import './src/tasks/locationTask';
import { registerBackgroundHandlers } from './src/services/notifications/handlers';
import 'expo-router/entry';

// Registered here, at module scope, because this is the path that runs when a
// push arrives with the app backgrounded or killed — there is no React tree yet.
// Moving this into a component silently breaks killed-app notifications.
registerBackgroundHandlers();