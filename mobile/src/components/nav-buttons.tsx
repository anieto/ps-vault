import { TouchableOpacity, Text, View } from 'react-native';
import { ChevronLeft, Plus } from 'lucide-react-native';

const PRIMARY = '#5B7FA6';

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
    >
      <ChevronLeft size={20} color={PRIMARY} strokeWidth={2.5} />
      <Text style={{ fontSize: 15, color: PRIMARY, fontWeight: '500' }}>Back</Text>
    </TouchableOpacity>
  );
}

export function AddButton({ onPress, label = 'Add' }: { onPress: () => void; label?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(91, 127, 166, 0.12)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
      }}
    >
      <Plus size={14} color={PRIMARY} strokeWidth={2.5} />
      <Text style={{ fontSize: 14, color: PRIMARY, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function TextActionButton({
  onPress,
  label,
  destructive = false,
}: {
  onPress: () => void;
  label: string;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ fontSize: 15, color: destructive ? '#ef4444' : PRIMARY, fontWeight: '500' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
