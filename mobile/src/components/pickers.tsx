import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/lib/theme';
import { formatDate, fromIsoDate, toIsoDate } from '@/lib/utils';
import { Row, Txt } from './ui';

const fieldStyle = {
  minHeight: 46,
  borderWidth: 1,
  borderColor: colors.input,
  borderRadius: radius.md,
  paddingHorizontal: 12,
  backgroundColor: colors.card,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
};

export function DateField({ value, onChange, maxToday }: { value: string; onChange: (iso: string) => void; maxToday?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Date, ${formatDate(value)}`}
      style={fieldStyle}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: fromIsoDate(value),
          mode: 'date',
          maximumDate: maxToday ? new Date() : new Date(2100, 11, 31),
          minimumDate: new Date(2000, 0, 1),
          onChange: (event, date) => {
            if (event.type === 'set' && date) onChange(toIsoDate(date));
          },
        })
      }>
      <Ionicons name="calendar-outline" size={18} color={colors.muted} />
      <Txt style={{ flex: 1 }}>{formatDate(value)}</Txt>
    </Pressable>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  left?: ReactNode;
}

export function Select({
  value,
  options,
  onChange,
  title,
  placeholder = 'Choose…',
}: {
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  title: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${selected?.label ?? placeholder}`} style={fieldStyle} onPress={() => setOpen(true)}>
        {selected?.left}
        <Txt style={{ flex: 1, color: selected ? colors.text : colors.muted }} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Txt>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12, maxHeight: '70%' }}>
          <Row style={{ padding: 16, justifyContent: 'space-between' }}>
            <Txt variant="h3">{title}</Txt>
            <Pressable onPress={() => setOpen(false)} accessibilityLabel="Close" hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>
          <ScrollView>
            {options.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [{ paddingHorizontal: 16, paddingVertical: 12 }, pressed && { backgroundColor: colors.subtle }]}>
                  <Row gap={12}>
                    {o.left}
                    <Txt style={{ flex: 1, fontWeight: active ? '600' : '400' }}>{o.label}</Txt>
                    {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </Row>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

export function BottomSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ ...StyleFill, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' }}>
          <Row style={{ padding: 16, paddingBottom: 8, justifyContent: 'space-between' }}>
            <Txt variant="h2">{title}</Txt>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 14, paddingBottom: insets.bottom + 24 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const StyleFill = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
