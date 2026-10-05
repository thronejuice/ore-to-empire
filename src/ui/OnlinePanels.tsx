import { useState } from 'react';
import { PACKS, PACK_ORDER } from '../config/meta';
import { fmtMoney } from '../i18n';
import { lineConfigured, paymentsConfigured } from '../online/config';
import type { Online, SaveSummary } from '../online/online';
import { useGame, useT } from './hooks';
import { GemIcon } from './nav';
import { Modal } from './Panels';

function useOnline(): Online | null {
  const game = useGame();
  return (game.online as Online | null) ?? null;
}

// ============================================================================ account

export function AccountPanel() {
  const game = useGame();
  const t = useT();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (game.ui.panel !== 'account') return null;
  const user = online?.ui.user;

  return (
    <Modal title={t('ui.account')} onClose={() => game.openPanel('none')}>
      {!online && <p className="small dim">{t('ui.connecting')}</p>}
      {online && user && (
        <>
          <div className="kv">
            <span>{t('ui.signedInAs')}</span>
            <strong>{user.name || user.email}</strong>
            <span>{t('ui.gems')}</span>
            <span className="mono">
              <GemIcon /> {game.state.gems}
            </span>
            <span>{t('ui.cloudSave')}</span>
            <span className="small">
              {online.ui.lastCloudSave ? t('ui.savedAt', { time: new Date(online.ui.lastCloudSave).toLocaleTimeString() }) : t('ui.notYet')}
            </span>
          </div>
          <p className="small dim">{t('ui.cloudHint')}</p>
          <button className="btn ghost full" onClick={() => void online.signOut()}>
            {t('ui.signOut')}
          </button>
        </>
      )}
      {online && !user && (
        <>
          <p className="small">{t('ui.signInWhy')}</p>
          {online.ui.emailSentTo ? (
            <p className="good small">{t('ui.emailSent', { email: online.ui.emailSentTo })}</p>
          ) : (
            <form
              className="email-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const err = await online.signInEmail(email.trim());
                if (err) setError(err);
              }}
            >
              <label htmlFor="signin-email" className="small dim">
                {t('ui.email')}
              </label>
              <div className="row">
                <input id="signin-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <button className="btn primary" type="submit">
                  {t('ui.sendLink')}
                </button>
              </div>
              {error && <p className="bad small">{error}</p>}
            </form>
          )}
          <div className="divider small dim">{t('ui.or')}</div>
          <button className="btn full social google" onClick={() => void online.signInGoogle()}>
            <span className="g">G</span> {t('ui.withGoogle')}
          </button>
          {lineConfigured && (
            <button className="btn full social line" onClick={() => online.signInLine()}>
              <span className="l">LINE</span> {t('ui.withLine')}
            </button>
          )}
          <p className="small dim">{t('ui.guestNote')}</p>
        </>
      )}
    </Modal>
  );
}

// ============================================================================ gem packs (inside the shop)

export function GemPacks() {
  const game = useGame();
  const t = useT();
  const online = useOnline();
  if (!paymentsConfigured) return null;
  const signedIn = !!online?.ui.user;
  return (
    <>
      <div className="section-label">{t('ui.buyGems')}</div>
      <div className="packs">
        {PACK_ORDER.map((id) => {
          const p = PACKS[id];
          return (
            <button key={id} className={`pack ${id === 'starter' ? 'starter' : ''}`} disabled={!online || game.ui.busy} onClick={() => void online?.buyPack(id)}>
              {id === 'starter' && <span className="pack-tag">{t('ui.starter')}</span>}
              <span className="pack-gems mono">
                <GemIcon size={18} /> {p.gems.toLocaleString()}
              </span>
              {p.bonusPct > 0 && <span className="small good">+{p.bonusPct}%</span>}
              {p.boostHours && <span className="small good">{t('ui.plusBoost', { h: p.boostHours })}</span>}
              <span className="pack-price mono">฿{p.priceThb}</span>
            </button>
          );
        })}
      </div>
      {!signedIn && (
        <button className="btn ghost full" onClick={() => game.openPanel('account')}>
          {t('ui.signInToBuy')}
        </button>
      )}
      <p className="small dim">{t('ui.payMethods')}</p>
    </>
  );
}

// ============================================================================ PromptPay QR / payment status

export function PaymentModal() {
  const t = useT();
  const online = useOnline();
  const p = online?.ui.payment;
  if (!online || !p) return null;
  const pack = PACKS[p.pack];
  return (
    <div className="modal-backdrop">
      <div className="modal welcome" role="dialog">
        <h2>{t('ui.payment')}</h2>
        {p.status === 'pending' && (
          <>
            {p.qr ? (
              <>
                <p className="small dim">{t('ui.scanQr', { amount: pack.priceThb })}</p>
                <img className="qr" src={p.qr} alt="PromptPay QR" width={240} height={240} />
              </>
            ) : (
              <p className="small dim">{t('ui.waitingPayment')}</p>
            )}
            <p className="small dim">{t('ui.waitingConfirm')}</p>
          </>
        )}
        {p.status === 'paid' && <p className="good">{t('ui.paymentDone', { gems: pack.gems })}</p>}
        {(p.status === 'failed' || p.status === 'expired') && (
          <p className="bad">
            {t('err.paymentFailed')} {p.failure ?? ''}
          </p>
        )}
        <button className="btn primary big" onClick={() => online.closePayment()}>
          {p.status === 'pending' ? t('ui.close') : t('ui.done')}
        </button>
      </div>
    </div>
  );
}

// ============================================================================ which save to keep

function SaveCard({ title, s, onPick, label }: { title: string; s: SaveSummary; onPick: () => void; label: string }) {
  const t = useT();
  return (
    <div className="save-card">
      <strong>{title}</strong>
      <span className="small dim">{new Date(s.savedAt).toLocaleString()}</span>
      <div className="kv">
        <span>{t('ui.totalEarned')}</span>
        <span className="mono">{fmtMoney(s.earned)}</span>
        <span>{t('ui.money')}</span>
        <span className="mono">{fmtMoney(s.money)}</span>
        <span>{t('ui.prestige')}</span>
        <span className="mono">{s.prestige}</span>
      </div>
      <button className="btn primary full" onClick={onPick}>
        {label}
      </button>
    </div>
  );
}

export function ConflictModal() {
  const t = useT();
  const online = useOnline();
  const c = online?.ui.conflict;
  if (!online || !c) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog">
        <div className="sheet-head">
          <h2>{t('ui.conflictTitle')}</h2>
        </div>
        <div className="modal-body">
          <p className="small dim">{t('ui.conflictBody')}</p>
          <div className="save-cards">
            <SaveCard title={t('ui.cloudSave')} s={c.cloud} label={t('ui.useCloud')} onPick={() => online.resolveConflict('cloud')} />
            <SaveCard title={t('ui.thisDevice')} s={c.local} label={t('ui.useLocal')} onPick={() => online.resolveConflict('local')} />
          </div>
        </div>
      </div>
    </div>
  );
}
