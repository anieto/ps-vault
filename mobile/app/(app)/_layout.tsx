import { Tabs } from 'expo-router';
import { LayoutDashboard, LockKeyhole, Users, Settings, ShieldCheck } from 'lucide-react-native';
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
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.07,
          shadowRadius: 10,
          elevation: 12,
          height: 80,
          paddingBottom: 18,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.1,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vaults"
        options={{
          title: 'Vaults',
          tabBarIcon: ({ color, size }) => <LockKeyhole size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="beneficiaries"
        options={{
          title: 'Beneficiaries',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
      {/* Admin tab — hidden unless user.role === 'admin'. Full panel in Phase 6. */}
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => <ShieldCheck size={size} color={color} />,
          href: isAdmin ? undefined : null,
        }}
      />
    </Tabs>
  );
}
