import { AlarmClock } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useId, useState, type FormEvent } from 'react';
import { localDate, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/calendar';
import {
  formFromDue,
  quickPicks,
  readDueForm,
  repeatOptions,
  type DueForm,
  type DueFormErrors,
  type QuickPick,
  type RepeatChoice,
} from '../../lib/dueForm';
import { notificationsBlocked, requestNotificationPermission } from '../../lib/reminders';
import type { Due, Repeat, RepeatUnit } from '../../lib/types';
import IconButton from '../ui/IconButton';
import styles from './DatePopover.module.css';

const UNIT_LABELS: Record<RepeatUnit, string> = { day: 'days', week: 'weeks', month: 'months', year: 'years' };
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

type Save = (date: string, time: string | null, repeat: Repeat | null) => void;

type CustomProps = { form: DueForm; errors: DueFormErrors; onChange: (changes: Partial<DueForm>) => void };

const CustomRepeat = ({ form, errors, onChange }: CustomProps) => {
  const id = useId();
  const toggle = (day: number) =>
    onChange({ weekdays: form.weekdays.includes(day) ? form.weekdays.filter((d) => d !== day) : [...form.weekdays, day] });
  return (
    <fieldset className={styles.custom}>
      <legend className={styles.srOnly}>Custom repeat</legend>
      <div className={styles.row}>
        <label htmlFor={`${id}-every`}>Every</label>
        <input
          id={`${id}-every`}
          className={styles.number}
          type='number'
          inputMode='numeric'
          min={1}
          max={99}
          value={form.every}
          aria-invalid={!!errors.every}
          aria-describedby={errors.every ? `${id}-every-error` : undefined}
          onChange={(e) => onChange({ every: e.target.value })}
        />
        <select aria-label='Repeat unit' value={form.unit} onChange={(e) => onChange({ unit: e.target.value as RepeatUnit })}>
          {(Object.keys(UNIT_LABELS) as RepeatUnit[]).map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
      </div>
      {errors.every && (
        <p id={`${id}-every-error`} role='alert' className={styles.error}>
          {errors.every}
        </p>
      )}
      {form.unit === 'week' && (
        <div className={styles.weekdays} role='group' aria-label='Days of the week'>
          {MONDAY_FIRST.map((day) => (
            <button
              key={day}
              type='button'
              className={styles.weekday}
              aria-pressed={form.weekdays.includes(day)}
              aria-label={WEEKDAY_LONG[day]}
              onClick={() => toggle(day)}
            >
              {WEEKDAY_SHORT[day].charAt(0)}
            </button>
          ))}
        </div>
      )}
      <fieldset className={styles.ends}>
        <legend>Ends</legend>
        <label className={styles.choice}>
          <input type='radio' name={`${id}-ends`} checked={form.ends === 'never'} onChange={() => onChange({ ends: 'never' })} />
          Never
        </label>
        <div className={styles.choice}>
          <label>
            <input type='radio' name={`${id}-ends`} checked={form.ends === 'on'} onChange={() => onChange({ ends: 'on' })} />
            On
          </label>
          <input
            type='date'
            aria-label='End date'
            value={form.endDate}
            disabled={form.ends !== 'on'}
            aria-invalid={!!errors.endDate}
            aria-describedby={errors.endDate ? `${id}-end-error` : undefined}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>
        <div className={styles.choice}>
          <label>
            <input type='radio' name={`${id}-ends`} checked={form.ends === 'after'} onChange={() => onChange({ ends: 'after' })} />
            After
          </label>
          <input
            className={styles.number}
            type='number'
            inputMode='numeric'
            min={1}
            max={999}
            aria-label='Number of times'
            value={form.endCount}
            disabled={form.ends !== 'after'}
            aria-invalid={!!errors.endCount}
            aria-describedby={errors.endCount ? `${id}-count-error` : undefined}
            onChange={(e) => onChange({ endCount: e.target.value })}
          />
          <span aria-hidden>times</span>
        </div>
        {errors.endDate && (
          <p id={`${id}-end-error`} role='alert' className={styles.error}>
            {errors.endDate}
          </p>
        )}
        {errors.endCount && (
          <p id={`${id}-count-error`} role='alert' className={styles.error}>
            {errors.endCount}
          </p>
        )}
      </fieldset>
    </fieldset>
  );
};

type FormProps = { due: Due | null; onSave: Save; onCancel: () => void; onRemove?: () => void };

// Mounted each time the popover opens, so it starts from the note's date.
const DateForm = ({ due, onSave, onCancel, onRemove }: FormProps) => {
  const [now] = useState(() => Date.now());
  const [form, setForm] = useState<DueForm>(() => formFromDue(due, localDate(now)));
  const [errors, setErrors] = useState<DueFormErrors>({});
  const [blocked] = useState(notificationsBlocked);
  const id = useId();

  const change = (changes: Partial<DueForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setErrors({});
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const result = readDueForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    requestNotificationPermission();
    onSave(result.date, result.time, result.repeat);
  };

  const pick = ({ date, time }: QuickPick) => {
    requestNotificationPermission();
    onSave(date, time, due?.repeat ?? null);
  };

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <div className={styles.picks} role='group' aria-label='Quick picks'>
        {quickPicks(now).map((p) => (
          <button key={p.label} type='button' className={styles.pick} onClick={() => pick(p)}>
            <span>{p.label}</span>
            <span className={styles.detail}>{p.detail}</span>
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-date`}>Date</label>
          <input
            id={`${id}-date`}
            type='date'
            required
            value={form.date}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? `${id}-date-error` : undefined}
            onChange={(e) => change({ date: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-time`}>Time</label>
          <input id={`${id}-time`} type='time' value={form.time} onChange={(e) => change({ time: e.target.value })} />
        </div>
        {form.time && (
          <button type='button' className={styles.link} onClick={() => change({ time: '' })}>
            No time
          </button>
        )}
      </div>
      {errors.date && (
        <p id={`${id}-date-error`} role='alert' className={styles.error}>
          {errors.date}
        </p>
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-repeat`}>Repeat</label>
        <select
          id={`${id}-repeat`}
          value={form.repeat}
          onChange={(e) => change({ repeat: e.target.value as RepeatChoice })}
        >
          {repeatOptions(form.date).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {form.repeat === 'custom' && <CustomRepeat form={form} errors={errors} onChange={change} />}
      {blocked && (
        <p className={styles.hint}>Notifications are blocked. You&apos;ll see reminders while Noteboard is open.</p>
      )}
      <div className={styles.actions}>
        {onRemove && (
          <button type='button' className={styles.button} onClick={onRemove}>
            Remove date
          </button>
        )}
        <span className={styles.spacer} />
        <button type='button' className={styles.button} onClick={onCancel}>
          Cancel
        </button>
        <button type='submit' className={`${styles.button} ${styles.primary}`}>
          Save
        </button>
      </div>
    </form>
  );
};

type Props = {
  due: Due | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: Save;
  onRemove: () => void;
};

const DatePopover = ({ due, open, onOpenChange, onSave, onRemove }: Props) => (
  <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Trigger asChild>
      <IconButton label={due ? 'Change date' : 'Add date'} data-date-button=''>
        <AlarmClock size={18} aria-hidden />
      </IconButton>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className={styles.content} align='end' sideOffset={6} collisionPadding={8} aria-label='Date'>
        <DateForm
          due={due}
          onSave={(date, time, repeat) => {
            onSave(date, time, repeat);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          onRemove={
            due
              ? () => {
                  onRemove();
                  onOpenChange(false);
                }
              : undefined
          }
        />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

export default DatePopover;
