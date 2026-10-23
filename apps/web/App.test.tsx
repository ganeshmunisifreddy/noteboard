import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './lib/db';
import { renderAt } from './lib/testRouter';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('App routes', () => {
  it('shows Not Found for an unknown address, with a way back', async () => {
    renderAt(<App />, '/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to notes' })).toHaveAttribute('href', '/');
  });

  it('opens the editor straight from its address', async () => {
    renderAt(<App />, '/note?id=missing');
    expect(await screen.findByText('Note not found')).toBeInTheDocument();
  });

  it('opens a board straight from its address', async () => {
    renderAt(<App />, '/board?id=missing');
    expect(await screen.findByText('Board not found')).toBeInTheDocument();
  });
});
