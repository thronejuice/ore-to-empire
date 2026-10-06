import { useState } from 'react';
import { PACKS, PACK_ORDER } from '../config/meta';
import { fmtMoney } from '../i18n';
import { lineConfigured, paymentsConfigured } from '../online/config';
import { maskCode } from '../core/player';
import { accountErrorKey } from '../online/errors';
import type { Online, SaveSummary } from '../online/online';
import { CopyButton } from './Onboarding';
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
  const [reveal, setReveal] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [confirmCode, setConfirmCode] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  if (game.ui.panel !== 'account') return null;
  const user = online?.ui.user;

  return (
    <Modal title={t('ui.account')} onClose={() => game.openPanel('none')}>
      {!online && <p className="small dim">{t('ui.connecting')}</p>}
      {online && user && (
        <>
          <div className="kv">
            <span>{t('acct.player')}</span>
            <strong data-testid="player-name">{online.ui.username ?? user.name ?? user.email}</strong>
            <span>{t('ui.gems')}</span>
            <span className="mono">
              <GemIcon /> {game.state.gems}
            </span>
            <span>{t('ui.cloudSave')}</span>
            <span className="small">
              {online.ui.lastCloudSave ? t('ui.savedAt', { time: new Date(online.ui.lastCloudSave).toLocaleTimeString() }) : t('ui.notYet')}
            </span>
          </div>
          <p className="small dim">{t('acct.cloudHint')}</p>

          <div className="acct-section">
            <div className="section-label">{t('acct.recoveryCode')}</div>
            {online.deviceCode() ? (
              <div className="acct-code">
                <span className="mono">{reveal ? online.deviceCode() : maskCode(online.deviceCode()!)}</span>
                <button className="btn small ghost" onClick={() => setReveal(!reveal)}>
                  {reveal ? t('acct.hide') : t('acct.show')}
                </button>
                <CopyButton text={online.deviceCode()!} />
              </div>
            ) : (
              <p className="small dim">{t('acct.noCodeHere')}</p>
            )}
            <button
              className={`btn small ${confirmCode ? 'danger armed' : 'ghost'}`}
              onClick={async () => {
                if (!confirmCode) return setConfirmCode(true);
                setConfirmCode(false);
                const err = await online.newRecoveryCode();
                if (err) setError(accountErrorKey(err));
                else game.openPanel('none');
              }}
            >
              {confirmCode ? t('acct.newCodeConfirm') : t('acct.newCode')}
            </button>
          </div>

          <div className="acct-section">
            <div className="section-label">{t('acct.backup')}</div>
            <p className="small dim">{t('acct.backupWhy')}</p>
            {user.email ? (
              <p className="small">
                {t('ui.email')}: <strong>{user.email}</strong>
              </p>
            ) : online.ui.linkSentTo ? (
              <p className="good small">{t('acct.linkSent', { email: online.ui.linkSentTo })}</p>
            ) : (
              <form
                className="email-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const err = await online.linkEmail(linkEmail.trim());
                  if (err) setError(err);
                }}
              >
                <div className="row">
                  <input type="email" required autoComplete="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="you@example.com" aria-label={t('ui.email')} />
                  <button className="btn" type="submit">
                    {t('acct.addEmail')}
                  </button>
                </div>
              </form>
            )}
            {online.linkedProviders().includes('google') ? (
              <p className="small good">✓ Google</p>
            ) : (
              <button className="btn full social google" onClick={() => void online.linkGoogle()}>
                <span className="g">G</span> {t('acct.linkGoogle')}
              </button>
            )}
            {lineConfigured && (
              <button className="btn full social line" onClick={() => online.signInLine('link')}>
                <span className="l">LINE</span> {t('acct.linkLine')}
              </button>
            )}
            {error && <p className="bad small">{t(error)}</p>}
          </div>

          <div className="acct-section">
            <button className={`btn full ${confirmOut ? 'danger armed' : 'ghost'}`} onClick={() => (confirmOut ? void online.signOut() : setConfirmOut(true))}>
              {confirmOut ? t('acct.signOutConfirm') : t('ui.signOut')}
            </button>
          </div>
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
          <button className="btn ghost full" onClick={() => online.showOnboarding('recover')}>
            {t('acct.haveAccount')}
          </button>
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
