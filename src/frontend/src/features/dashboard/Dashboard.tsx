import { useEffect, useState } from 'react';
import { Button } from '@gouvfr-lasuite/cunningham-react';
import { useTranslation } from 'react-i18next';
import { AppLauncher } from '../slide-editor/components/AppLauncher';
import { LanguagePicker } from '../../i18n/LanguagePicker';
import {
  type Presentation,
  listPresentations,
  createPresentation,
  renamePresentation,
  deletePresentation,
  openPresentation,
} from './api';
import { type CurrentUser, getCurrentUser, login, logout } from './auth';
import './Dashboard.css';

const mi = (name: string) => (
  <span className="material-icons" aria-hidden="true">
    {name}
  </span>
);

const fmtDate = (iso: string, lang: string) => {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: Presentation[] };

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);

  const reload = async () => {
    try {
      const items = await listPresentations();
      setState({ kind: 'ready', items });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : t('Erreur') });
    }
  };

  useEffect(() => {
    void reload();
    void getCurrentUser().then(setUser);
  }, []);

  const onCreate = async () => {
    setBusy(true);
    try {
      const p = await createPresentation(t('Présentation sans titre'));
      openPresentation(p.id);
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : t('Création impossible') });
      setBusy(false);
    }
  };

  const onRename = async (p: Presentation) => {
    const title = window.prompt(t('Renommer la présentation'), p.title);
    if (title == null || title.trim() === '' || title === p.title) return;
    await renamePresentation(p.id, title.trim());
    void reload();
  };

  const onDelete = async (p: Presentation) => {
    if (!window.confirm(t('Supprimer « {{title}} » ? Cette action est irréversible.', { title: p.title })))
      return;
    await deletePresentation(p.id);
    void reload();
  };

  return (
    <div className="dash">
      <a href="#dash-main" className="skip-link">
        {t('Aller au contenu principal')}
      </a>
      <header className="topbar">
        <AppLauncher />
        <strong>{t('Diapo')}</strong>
        <span style={{ marginLeft: 'auto' }}>
          <LanguagePicker />
        </span>
        {/* Auth control. When the backend has OIDC on → login/logout. In local AllowAny mode we
            show an honest "no auth" hint (rather than nothing) so the feature is discoverable. */}
        {user &&
          (user.auth_enabled ? (
            <div className="dash__auth" style={{ marginLeft: 12 }}>
              {user.is_authenticated ? (
                <>
                  <span className="muted" title={user.email}>
                    {user.full_name || user.username}
                  </span>
                  <Button size="small" variant="tertiary" color="neutral" onClick={() => logout()}>
                    {t('Se déconnecter')}
                  </Button>
                </>
              ) : (
                <Button size="small" color="brand" icon={mi('login')} onClick={() => login()}>
                  {t('Se connecter')}
                </Button>
              )}
            </div>
          ) : (
            <span
              className="muted"
              style={{ marginLeft: 12, fontSize: 13 }}
              title={t(
                'Authentification désactivée (mode local). Lancez « make dev-auth » pour activer Keycloak.',
              )}
            >
              {t('Mode local, sans authentification')}
            </span>
          ))}
      </header>

      <main className="dash__main" id="dash-main" tabIndex={-1}>
        <div className="dash__head">
          <h1 className="dash__title">{t('Mes présentations')}</h1>
          <Button color="brand" icon={mi('add')} onClick={onCreate} disabled={busy}>
            {t('Nouvelle présentation')}
          </Button>
        </div>

        {state.kind === 'loading' && <p className="dash__muted">{t('Chargement…')}</p>}

        {state.kind === 'error' && (
          <div className="dash__error">
            <p>{t('Impossible de joindre le service ({{message}}).', { message: state.message })}</p>
            <p className="dash__muted">{t('Le backend est-il démarré sur le port 8000 ?')}</p>
            <Button variant="secondary" onClick={() => void reload()}>
              {t('Réessayer')}
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.items.length === 0 && (
          <div className="dash__empty">
            <span className="material-icons" aria-hidden="true">
              slideshow
            </span>
            <p>{t('Aucune présentation pour l’instant.')}</p>
            <Button color="brand" icon={mi('add')} onClick={onCreate} disabled={busy}>
              {t('Créer la première')}
            </Button>
          </div>
        )}

        {state.kind === 'ready' && state.items.length > 0 && (
          <ul className="dash__grid">
            {state.items.map((p) => (
              <li key={p.id} className="deck-card">
                <button
                  type="button"
                  className="deck-card__open"
                  onClick={() => openPresentation(p.id)}
                  aria-label={t('Ouvrir {{title}}', { title: p.title })}
                >
                  <span className="deck-card__thumb">
                    <span className="material-icons" aria-hidden="true">
                      slideshow
                    </span>
                  </span>
                  <span className="deck-card__title">{p.title}</span>
                  <span className="deck-card__date">
                    {t('Modifié le {{date}}', { date: fmtDate(p.updated_at, i18n.language) })}
                  </span>
                </button>
                <div className="deck-card__actions">
                  <Button
                    size="nano"
                    variant="tertiary"
                    color="neutral"
                    icon={mi('edit')}
                    aria-label={t('Renommer')}
                    onClick={() => void onRename(p)}
                  />
                  <Button
                    size="nano"
                    variant="tertiary"
                    color="neutral"
                    icon={mi('delete')}
                    aria-label={t('Supprimer')}
                    onClick={() => void onDelete(p)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
