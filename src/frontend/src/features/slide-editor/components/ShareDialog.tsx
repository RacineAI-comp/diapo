import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, ModalSize, Select } from '@gouvfr-lasuite/cunningham-react';
import { type LinkRole, getPresentation, setLinkRole } from '../../dashboard/api';
import './ShareDialog.css';

interface Props {
  id: string;
  open: boolean;
  onClose: () => void;
}

// Link-sharing: copy the deck URL and set what anyone with the link can do (read / edit).
// link_role drives the backend abilities, which the collab server enforces (read-only vs writable).
export function ShareDialog({ id, open, onClose }: Props) {
  const { t } = useTranslation();
  const [role, setRole] = useState<LinkRole>('editor');
  const [saved, setSaved] = useState<boolean | null>(null); // null=unknown, false=not in backend
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    getPresentation(id)
      .then((p) => {
        setRole((p.link_role as LinkRole) ?? 'editor');
        setSaved(true);
      })
      .catch(() => setSaved(false));
  }, [open, id]);

  const onRole = async (next: LinkRole) => {
    setRole(next);
    if (saved) await setLinkRole(id, next).catch(() => {});
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Modal size={ModalSize.MEDIUM} isOpen={open} onClose={onClose} title={t('Partager la présentation')}>
      <div className="share">
        <label className="share__label">{t('Lien de la présentation')}</label>
        <div className="share__row">
          <Input value={url} readOnly fullWidth aria-label={t('Lien')} />
          <Button variant="secondary" color="brand" onClick={copy}>
            {copied ? t('Copié ✓') : t('Copier')}
          </Button>
        </div>

        <div className="share__access">
          <Select
            label={t('Accès par lien')}
            value={role}
            disabled={saved === false}
            options={[
              { value: 'reader', label: t('Lecture seule') },
              { value: 'editor', label: t('Édition') },
            ]}
            onChange={(e) => void onRole(e.target.value as LinkRole)}
          />
          {saved === false && (
            <p className="share__note">
              {t(
                'Ce document n’est pas encore enregistré côté serveur : le lien fonctionne, mais le niveau d’accès n’est pas modifiable. Créez la présentation depuis le tableau de bord pour gérer les droits.',
              )}
            </p>
          )}
          {saved && (
            <p className="share__note">
              {t(
                '« Lecture seule » empêche les visiteurs du lien de modifier le contenu (appliqué par le serveur de collaboration).',
              )}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
