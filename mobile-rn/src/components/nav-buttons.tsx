import { TouchableOpacity, Text } from 'react-native';
import { ChevronLeft, Plus } from 'lucide-react-native';

const PRIMARY = '#5B7FA6';
const PILL_BG = 'rgba(91, 127, 166, 0.12)';

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: PILL_BG,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
      }}
    >
      <ChevronLeft size={14} color={PRIMARY} strokeWidth={2.5} />
      <Text style={{ fontSize: 14, color: PRIMARY, fontWeight: '600' }}>Back</Text>
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
        backgroundColor: PILL_BG,
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
  muted = false,
}: {
  onPress: () => void;
  label: string;
  destructive?: boolean;
  muted?: boolean;
}) {
  const color = destructive ? '#ef4444' : PRIMARY;
  const bg = destructive
    ? 'rgba(239, 68, 68, 0.10)'
    : muted
    ? 'rgba(0, 0, 0, 0.06)'
    : PILL_BG;
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        backgroundColor: bg,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
      }}
    >
      <Text style={{ fontSize: 14, color, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}
