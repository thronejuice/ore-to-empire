import { ONLINE } from './config';

/**
 * Omise's hosted payment popup (OmiseCard). Card details never touch our code:
 * the popup returns a one-time token (card) or source id (PromptPay, TrueMoney),
 * which the create-charge edge function turns into a charge with the secret key.
 */

interface OmiseCardApi {
  configure(opts: { publicKey: string }): void;
  open(opts: {
    amount: number;
    currency: string;
    frameLabel: string;
    submitLabel: string;
    defaultPaymentMethod: string;
    otherPaymentMethods: string;
    onCreateTokenSuccess: (nonce: string) => void;
    onFormClosed?: () => void;
  }): void;
}

declare global {
  interface Window {
    OmiseCard?: OmiseCardApi;
  }
}

let loading: Promise<OmiseCardApi> | null = null;

function loadOmise(): Promise<OmiseCardApi> {
  if (window.OmiseCard) return Promise.resolve(window.OmiseCard);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.omise.co/omise.js';
      s.async = true;
      s.onload = () => (window.OmiseCard ? resolve(window.OmiseCard) : reject(new Error('OmiseCard missing')));
      s.onerror = () => {
        loading = null;
        reject(new Error('Could not load Omise'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function openOmiseCard(opts: { amount: number; frameLabel: string; submitLabel: string; onToken: (nonce: string) => void; onClose?: () => void }) {
  const card = await loadOmise();
  card.configure({ publicKey: ONLINE.omisePublicKey });
  card.open({
    amount: opts.amount,
    currency: 'THB',
    frameLabel: opts.frameLabel,
    submitLabel: opts.submitLabel,
    defaultPaymentMethod: 'credit_card',
    otherPaymentMethods: 'promptpay,truemoney',
    onCreateTokenSuccess: opts.onToken,
    onFormClosed: opts.onClose,
  });
}
