import { Tabs } from 'expo-router';
import { useAuthStore } from '@/store/auth';

export default function AppLayout() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5B7FA6',
        tabBarInactiveTintColor: '#9A9490',
        tabBarStyle: {
          backgroundColor: '#F9F8F6',
          borderTopColor: '#D8D4CC',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            // Placeholder — replace with an icon library (e.g. @expo/vector-icons)
            null
          ),
        }}
      />
      <Tabs.Screen
        name="vaults"
        options={{
          title: 'Vaults',
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="beneficiaries"
        options={{
          title: 'People',
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: () => null,
        }}
      />
      {/* Admin tab — hidden unless user.role === 'admin'. Full panel in Phase 6. */}
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: () => null,
          href: isAdmin ? undefined : null,
        }}
      />
    </Tabs>
  );
}
