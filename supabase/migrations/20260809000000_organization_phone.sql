-- Ajustes has always offered a "Teléfono WhatsApp de Contacto" field, but
-- organizations had no phone column, so the value only ever existed in one
-- browser's localStorage while the save reported success (#95). This is also
-- the column the org-phone-backed "Solicitar Cambios" replacement needs (#44).
--
-- Nullable on purpose: an organization without a contact phone is a valid
-- state, and every consumer must treat the absence as "offer no control"
-- rather than fall back to a placeholder number.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS phone text;
