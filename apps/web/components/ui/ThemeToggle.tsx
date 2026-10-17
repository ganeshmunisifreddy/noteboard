import { Moon, Sun } from 'lucide-react';
import { setTheme, useAppearance } from '../../lib/theme';
import IconButton from './IconButton';

// Switches between light and dark. "Use device theme" in the ⋯ menu goes
// back to following the device.
const ThemeToggle = () => {
  const dark = useAppearance() === 'dark';
  return (
    <IconButton
      label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </IconButton>
  );
};

export default ThemeToggle;
