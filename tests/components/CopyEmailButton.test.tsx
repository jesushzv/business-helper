import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CopyEmailButton } from '@/components/landing/CopyEmailButton';
import { ContactSection } from '@/components/landing/ContactSection';
import { TeamSection } from '@/components/landing/TeamSection';
import { CONTACT_INFO, TEAM_MEMBERS } from '@/lib/trustData';

/**
 * The contact CTAs are mailto: links, which do nothing visible on a machine
 * with no mail handler (the "buttons to send emails do not do anything"
 * report). CopyEmailButton is the fallback that must always work — and, per
 * hard rule #1, must never say "Copiado" for a copy that did not happen.
 */

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  removeClipboard();
  vi.restoreAllMocks();
});

describe('CopyEmailButton', () => {
  it('copies the address to the clipboard and reports "Copiado"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyEmailButton email="contacto@businesshelper.app" />);
    fireEvent.click(screen.getByRole('button', { name: /copiar correo/i }));

    await waitFor(() => {
      expect(screen.getByText('Copiado')).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledWith('contacto@businesshelper.app');
  });

  it('does NOT claim "Copiado" when every copy mechanism fails', async () => {
    // No async clipboard API at all, and execCommand refuses.
    removeClipboard();
    document.execCommand = vi.fn().mockReturnValue(false);

    render(<CopyEmailButton email="contacto@businesshelper.app" />);
    fireEvent.click(screen.getByRole('button', { name: /copiar correo/i }));

    await waitFor(() => {
      expect(screen.getByText('No se pudo copiar')).toBeInTheDocument();
    });
    expect(screen.queryByText('Copiado')).not.toBeInTheDocument();
  });

  it('falls back to execCommand when the async clipboard API rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    document.execCommand = vi.fn().mockReturnValue(true);

    render(<CopyEmailButton email="soporte@businesshelper.app" />);
    fireEvent.click(screen.getByRole('button', { name: /copiar correo/i }));

    await waitFor(() => {
      expect(screen.getByText('Copiado')).toBeInTheDocument();
    });
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('ContactSection email affordances', () => {
  it('renders a mailto link AND a copy fallback for every published address', () => {
    render(<ContactSection />);

    const addresses = [
      CONTACT_INFO.email,
      CONTACT_INFO.supportEmail,
      CONTACT_INFO.founderEmail,
      CONTACT_INFO.privacyEmail,
    ];

    addresses.forEach((address) => {
      // The mailto CTA still exists for devices that do have a mail app…
      const mailtoLinks = screen
        .getAllByRole('link')
        .filter((a) => (a.getAttribute('href') || '').startsWith(`mailto:${address}`));
      expect(mailtoLinks.length, `missing mailto link for ${address}`).toBeGreaterThan(0);

      // …and the copy button covers the devices where mailto does nothing.
      expect(
        screen.getByRole('button', { name: `Copiar correo ${address}` }),
        `missing copy fallback for ${address}`
      ).toBeInTheDocument();
    });
  });
});

describe('TeamSection email affordances', () => {
  it('renders a copy fallback next to each member mailto link', () => {
    render(<TeamSection />);

    TEAM_MEMBERS.forEach((member) => {
      expect(
        screen.getByRole('button', { name: `Copiar correo ${member.contactEmail}` })
      ).toBeInTheDocument();
    });
  });
});
