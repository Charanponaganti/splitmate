import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { avatarColors, colors, radius, space } from '@/lib/theme';
import { initials } from '@/lib/utils';
import { formatMoney } from '@/lib/money';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/* Feedback ----------------------------------------------------------------- */

export function toast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
}

export function confirm(title: string, message: string, confirmLabel = 'Confirm', destructive = true): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/* Layout ------------------------------------------------------------------- */

export function Screen({
  children,
  refreshing,
  onRefresh,
  style,
  footer,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.screen, style]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          ) : undefined
        }>
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function BottomBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }, style]}>{children}</View>;
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: space.lg }, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** Card-like styling for one cell of a FlatList, rounding the first and last. */
export function listCell(index: number, count: number): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderTopLeftRadius: index === 0 ? radius.lg : 0,
    borderTopRightRadius: index === 0 ? radius.lg : 0,
    borderBottomLeftRadius: index === count - 1 ? radius.lg : 0,
    borderBottomRightRadius: index === count - 1 ? radius.lg : 0,
    overflow: 'hidden',
  };
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <Txt variant="h3">{title}</Txt>
      {action}
    </Row>
  );
}

/* Text --------------------------------------------------------------------- */

const textVariants = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 19, fontWeight: '700', color: colors.text },
  h3: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  small: { fontSize: 12, color: colors.muted },
});

export function Txt({
  variant = 'body',
  style,
  children,
  numberOfLines,
}: {
  variant?: keyof typeof textVariants;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={[textVariants[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/* Buttons ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  size = 'md',
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const inactive = disabled || loading;
  const fg =
    variant === 'primary' ? colors.primaryText : variant === 'danger' ? colors.negative : variant === 'outline' ? colors.text : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && { minHeight: 36, paddingHorizontal: 12 },
        size === 'lg' && { minHeight: 52 },
        variant === 'primary' && { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.input, backgroundColor: pressed ? colors.subtle : colors.card },
        variant === 'danger' && { borderWidth: 1, borderColor: '#fecdd3', backgroundColor: pressed ? '#ffe4e6' : colors.negativeBg },
        variant === 'ghost' && { backgroundColor: pressed ? colors.accent : 'transparent' },
        inactive && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} />}
          <Text style={{ color: fg, fontWeight: '600', fontSize: size === 'sm' ? 14 : 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.text }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [{ padding: 8, borderRadius: radius.full }, pressed && { backgroundColor: colors.subtle }]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

/** Set `aboveTabBar` on tab screens, where the tab bar already clears the system navigation bar. */
export function Fab({ onPress, label = 'Add expense', aboveTabBar = false }: { onPress: () => void; label?: string; aboveTabBar?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { bottom: space.lg + (aboveTabBar ? 0 : insets.bottom) },
        pressed && { backgroundColor: colors.primaryPressed },
      ]}>
      <Ionicons name="add" size={24} color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/* Inputs ------------------------------------------------------------------- */

export const Input = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(function Input({ style, invalid, ...props }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#a1a1aa"
      style={[styles.input, invalid && { borderColor: colors.negative }, props.multiline && { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }, style]}
      {...props}
    />
  );
});

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="small" style={{ fontWeight: '600', color: colors.text, fontSize: 13 }}>
        {label}
      </Txt>
      {children}
      {error ? (
        <Txt variant="small" style={{ color: colors.negative }}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="small">{hint}</Txt>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.text : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  left,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  left?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected && { borderColor: colors.primary, backgroundColor: colors.accent },
      ]}>
      {left}
      <Text style={{ fontSize: 14, color: selected ? colors.primary : colors.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: checked ? colors.primary : colors.input,
        backgroundColor: checked ? colors.primary : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
    </View>
  );
}

/* Display ------------------------------------------------------------------ */

export function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const [bg, fg] = avatarColors(id);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

export function AvatarStack({ people, max = 4 }: { people: { id: string; name: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  return (
    <Row gap={0}>
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: colors.card, borderRadius: 99 }}>
          <Avatar id={p.id} name={p.name} size={26} />
        </View>
      ))}
      {people.length > max && <Txt variant="small" style={{ marginLeft: 6 }}>+{people.length - max}</Txt>}
    </Row>
  );
}

export function IconBadge({ icon, tone = 'accent', size = 40 }: { icon: IconName; tone?: 'accent' | 'muted' | 'negative'; size?: number }) {
  const bg = tone === 'accent' ? colors.accent : tone === 'negative' ? colors.negativeBg : colors.subtle;
  const fg = tone === 'accent' ? colors.primary : tone === 'negative' ? colors.negative : colors.muted;
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </View>
  );
}

export function Money({
  minor,
  currency,
  tone = 'auto',
  style,
  signed,
}: {
  minor: number;
  currency: string;
  tone?: 'auto' | 'plain';
  style?: StyleProp<TextStyle>;
  signed?: boolean;
}) {
  const color = tone === 'plain' || minor === 0 ? colors.text : minor > 0 ? colors.positive : colors.negative;
  return <Text style={[{ color, fontWeight: '600', fontVariant: ['tabular-nums'] }, style]}>{formatMoney(minor, currency, { signed })}</Text>;
}

/** "You owe ₹X" / "You get back ₹X" / "Settled up" for a net balance. */
export function BalanceLabel({ minor, currency, size = 15 }: { minor: number; currency: string; size?: number }) {
  if (minor === 0) return <Txt style={{ fontSize: size, color: colors.muted }}>Settled up</Txt>;
  const owes = minor < 0;
  return (
    <Text style={{ fontSize: size, color: owes ? colors.negative : colors.positive }}>
      {owes ? 'You owe ' : 'You get back '}
      <Text style={{ fontWeight: '700' }}>{formatMoney(Math.abs(minor), currency)}</Text>
    </Text>
  );
}

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'accent' | 'negative' }) {
  const bg = tone === 'accent' ? colors.accent : tone === 'negative' ? colors.negativeBg : colors.subtle;
  const fg = tone === 'accent' ? colors.primary : tone === 'negative' ? colors.negative : colors.muted;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function ListItem({
  left,
  title,
  subtitle,
  right,
  onPress,
  chevron,
}: {
  left?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const content = (
    <Row gap={space.md} style={{ paddingVertical: 12, paddingHorizontal: space.lg }}>
      {left}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {typeof title === 'string' ? <Txt numberOfLines={1} style={{ fontWeight: '500' }}>{title}</Txt> : title}
        {typeof subtitle === 'string' ? <Txt variant="small" numberOfLines={2}>{subtitle}</Txt> : subtitle}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Row>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { backgroundColor: colors.subtle }}>
      {content}
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: space.lg, gap: 8 }}>
      <IconBadge icon={icon} size={52} />
      <Txt variant="h3" style={{ textAlign: 'center', marginTop: 4 }}>
        {title}
      </Txt>
      {body && (
        <Txt variant="muted" style={{ textAlign: 'center' }}>
          {body}
        </Txt>
      )}
      {action && <View style={{ marginTop: 8 }}>{action}</View>}
    </View>
  );
}

export function LoadingView() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load this"
        body={errorMessage(error)}
        action={onRetry && <Button title="Try again" variant="outline" onPress={onRetry} />}
      />
    </View>
  );
}

export function StatusLine({ ok, text }: { ok: boolean; text: string }) {
  if (!text) return null;
  return (
    <Row gap={6}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={ok ? colors.positive : colors.negative} />
      <Txt variant="small" style={{ color: ok ? colors.positive : colors.negative, flex: 1 }}>
        {text}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.lg, paddingBottom: 120 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bottomBar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  fab: {
    position: 'absolute',
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    height: 54,
    borderRadius: radius.full,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  segmented: { flexDirection: 'row', backgroundColor: colors.subtle, borderRadius: radius.md, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.card, elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 12,
    backgroundColor: colors.card,
  },
});
