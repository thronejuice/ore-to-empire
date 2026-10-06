import { useEffect, useRef, useState } from 'react';
import { NAME_MAX, nameProblem } from '../core/player';
import { lineConfigured, onlineConfigured, ONLINE } from '../online/config';
import { accountErrorKey } from '../online/errors';
import type { Online } from '../online/online';
import { mountTurnstile } from '../online/turnstile';
import { useGame, useT } from './hooks';

function useOnline(): Online | null {
  const game = useGame();
  return (game.online as Online | null) ?? null;
}

/** The step before play: pick a name (or restore an account). */
export function Onboarding() {
  const game = useGame();
  const online = useOnline();
  if (!onlineConfigured) return game.state.player ? null : <LocalName />;
  const step = online?.ui.onboarding;
  if (!online || !step) return null;
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal onboarding" role="dialog" aria-modal="true">
        {step === 'name' && <CreateName online={online} />}
        {step === 'set-name' && <SetName online={online} />}
        {step === 'code' && <ShowCode online={online} />}
        {step === 'recover' && <Recover online={online} />}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="ob-brand">
      <span className="ob-logo" aria-hidden>
        ◆
      </span>
      <span>Ore to Empire</span>
    </div>
  );
}

type Check = 'idle' | 'checking' | 'free' | 'taken' | 'offline';

/** name field with rules + (online) a live "is it free?" check */
function NameField({
  value,
  onChange,
  online,
  check,
  setCheck,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  online: Online | null;
  check: Check;
  setCheck: (c: Check) => void;
  autoFocus?: boolean;
}) {
  const t = useT();
  const problem = value.trim() ? nameProblem(value) : null;
  const seq = useRef(0);

  useEffect(() => {
    if (!online || !value.trim() || nameProblem(value)) {
      setCheck('idle');
      return;
    }
    const my = ++seq.current;
    setCheck('checking');
    const timer = window.setTimeout(async () => {
      const free = await online.nameAvailable(value);
      if (my !== seq.current) return;
      setCheck(free === null ? 'offline' : free ? 'free' : 'taken');
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, online]);

  let hint: { cls: string; text: string } = { cls: 'dim', text: t('acct.nameRules') };
  if (problem) hint = { cls: 'bad', text: t(`acct.name.${problem}`) };
  else if (check === 'checking') hint = { cls: 'dim', text: t('acct.checking') };
  else if (check === 'free') hint = { cls: 'good', text: t('acct.nameFree') };
  else if (check === 'taken') hint = { cls: 'bad', text: t('acct.err.name_taken') };

  return (
    <div className="ob-field">
      <label htmlFor="ob-name" className="small dim">
        {t('acct.yourName')}
      </label>
      <input
        id="ob-name"
        className="ob-input"
        value={value}
        maxLength={NAME_MAX + 4}
        autoFocus={autoFocus}
        autoComplete="nickname"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={t('acct.namePlaceholder')}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className={`small ${hint.cls}`} aria-live="polite">
        {hint.text}
      </p>
    </div>
  );
}

function CreateName({ online }: { online: Online }) {
  const t = useT();
  const [name, setName] = useState(online.ui.recoverName);
  const [check, setCheck] = useState<Check>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaEl = useRef<HTMLDivElement>(null);
  const needCaptcha = !!ONLINE.turnstileSiteKey;

  useEffect(() => {
    if (!needCaptcha || !captchaEl.current) return;
    return mountTurnstile(captchaEl.current, ONLINE.turnstileSiteKey, setCaptcha);
  }, [needCaptcha, captchaKey]);

  const ok = !nameProblem(name) && check !== 'taken' && check !== 'checking' && (!needCaptcha || !!captcha);

  return (
    <form
      className="ob-body"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        setError(null);
        const err = await online.createAccount(name, captcha ?? undefined);
        setBusy(false);
        if (err === 'network') setOffline(true);
        if (err) {
          setError(accountErrorKey(err));
          if (err === 'name_taken') setCheck('taken');
          if (needCaptcha) {
            setCaptcha(null);
            setCaptchaKey((k) => k + 1); // tokens are single-use
          }
        }
      }}
    >
      <Brand />
      <h2>{t('acct.welcome')}</h2>
      {online.ui.onboardingNote && <p className="small warn-note">{t(online.ui.onboardingNote)}</p>}
      <p className="small dim">{t('acct.pickName')}</p>
      <NameField value={name} onChange={setName} online={online} check={check} setCheck={setCheck} />
      {needCaptcha && <div className="ob-captcha" ref={captchaEl} key={captchaKey} />}
      {error && <p className="bad small">{t(error)}</p>}
      <button className="btn primary big full" type="submit" disabled={!ok || busy}>
        {busy ? t('acct.creating') : t('acct.start')}
      </button>
      {offline && (
        <button type="button" className="btn ghost full" disabled={!!nameProblem(name)} onClick={() => online.playOfflineAs(name)}>
          {t('acct.playOffline')}
        </button>
      )}
      <p className="small dim ob-note">{t('acct.autoLogin')}</p>
      <button type="button" className="link-btn" onClick={() => online.showOnboarding('recover')}>
        {t('acct.haveAccount')}
      </button>
    </form>
  );
}

function SetName({ online }: { online: Online }) {
  const t = useT();
  const [name, setName] = useState(online.ui.recoverName);
  const [check, setCheck] = useState<Check>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = !nameProblem(name) && check !== 'taken' && check !== 'checking';
  return (
    <form
      className="ob-body"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        const err = await online.setUsername(name);
        setBusy(false);
        setError(err ? accountErrorKey(err) : null);
      }}
    >
      <Brand />
      <h2>{t('acct.setNameTitle')}</h2>
      <p className="small dim">{t('acct.setNameBody')}</p>
      <NameField value={name} onChange={setName} online={online} check={check} setCheck={setCheck} />
      {error && <p className="bad small">{t(error)}</p>}
      <button className="btn primary big full" type="submit" disabled={!ok || busy}>
        {t('acct.confirmName')}
      </button>
    </form>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the code is selectable */
        }
      }}
    >
      {done ? t('acct.copied') : (label ?? t('acct.copy'))}
    </button>
  );
}

function ShowCode({ online }: { online: Online }) {
  const t = useT();
  const code = online.ui.newCode ?? '';
  const [ack, setAck] = useState(false);
  return (
    <div className="ob-body">
      <Brand />
      <h2>{t('acct.codeTitle', { name: online.ui.username ?? '' })}</h2>
      <p className="small dim">{t('acct.codeBody')}</p>
      <div className="ob-code mono" data-testid="recovery-code">
        {code}
      </div>
      <div className="row-center">
        <CopyButton text={code} />
      </div>
      <ul className="small dim ob-list">
        <li>{t('acct.codeWhy1')}</li>
        <li>{t('acct.codeWhy2')}</li>
      </ul>
      <label className="ob-check small">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        {t('acct.codeSaved')}
      </label>
      <button className="btn primary big full" disabled={!ack} onClick={() => online.savedCode()}>
        {t('acct.letsPlay')}
      </button>
    </div>
  );
}

function Recover({ online }: { online: Online }) {
  const t = useT();
  const [name, setName] = useState(online.ui.recoverName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  return (
    <div className="ob-body">
      <Brand />
      <h2>{t('acct.recoverTitle')}</h2>
      {online.ui.onboardingNote && <p className="small warn-note">{t(online.ui.onboardingNote)}</p>}
      <form
        className="ob-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          const err = await online.recover(name, code);
          setBusy(false);
          if (err) setError(accountErrorKey(err));
        }}
      >
        <label htmlFor="rc-name" className="small dim">
          {t('acct.yourName')}
        </label>
        <input id="rc-name" className="ob-input" value={name} autoComplete="username" autoCapitalize="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="rc-code" className="small dim">
          {t('acct.recoveryCode')}
        </label>
        <input
          id="rc-code"
          className="ob-input mono"
          value={code}
          placeholder="ORE-XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p className="bad small">{t(error)}</p>}
        <button className="btn primary big full" type="submit" disabled={busy || !name.trim() || !code.trim()}>
          {busy ? t('acct.checking') : t('acct.restore')}
        </button>
      </form>

      <div className="divider small dim">{t('acct.orBackup')}</div>
      {online.ui.emailSentTo ? (
        <p className="good small">{t('ui.emailSent', { email: online.ui.emailSentTo })}</p>
      ) : (
        <form
          className="email-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const err = await online.signInEmail(email.trim());
            if (err) setError(err);
          }}
        >
          <div className="row">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label={t('ui.email')} />
            <button className="btn" type="submit">
              {t('ui.sendLink')}
            </button>
          </div>
        </form>
      )}
      <button className="btn full social google" onClick={() => void online.signInGoogle()}>
        <span className="g">G</span> {t('ui.withGoogle')}
      </button>
      {lineConfigured && (
        <button className="btn full social line" onClick={() => online.signInLine()}>
          <span className="l">LINE</span> {t('ui.withLine')}
        </button>
      )}
      <button type="button" className="link-btn" onClick={() => online.showOnboarding('name')}>
        {t('acct.newPlayer')}
      </button>
    </div>
  );
}

/** builds without a server (single file / artifact): the name stays on this device */
function LocalName() {
  const game = useGame();
  const t = useT();
  const [name, setName] = useState('');
  const [check, setCheck] = useState<Check>('idle');
  const ok = !nameProblem(name);
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="modal onboarding" role="dialog" aria-modal="true">
        <form
          className="ob-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) game.setPlayerName(name.trim());
          }}
        >
          <Brand />
          <h2>{t('acct.welcome')}</h2>
          <p className="small dim">{t('acct.pickNameLocal')}</p>
          <NameField value={name} onChange={setName} online={null} check={check} setCheck={setCheck} />
          <button className="btn primary big full" type="submit" disabled={!ok}>
            {t('acct.start')}
          </button>
        </form>
      </div>
    </div>
  );
}
