-- Add project details fields for Tievahti-style documents
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS project_type TEXT,
ADD COLUMN IF NOT EXISTS tiekunta TEXT,
ADD COLUMN IF NOT EXISTS kayttooikeusyksikkotunnus TEXT,
ADD COLUMN IF NOT EXISTS kunta TEXT,
ADD COLUMN IF NOT EXISTS kohdeosoite TEXT,
ADD COLUMN IF NOT EXISTS osakas_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS yksikko_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vastuuhenkilo_name TEXT,
ADD COLUMN IF NOT EXISTS vastuuhenkilo_phone TEXT,
ADD COLUMN IF NOT EXISTS vastuuhenkilo_email TEXT;

-- Create project_text_sections table for editable general text sections
CREATE TABLE IF NOT EXISTS public.project_text_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL, -- e.g., 'puustonpoisto', 'sivu_ja_laskuojat', 'yleiset_asiat'
  title TEXT NOT NULL, -- Display title e.g., 'Puustonpoisto'
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, section_key)
);

-- Enable RLS
ALTER TABLE public.project_text_sections ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (matching existing project policies)
CREATE POLICY "Public access to project_text_sections" 
ON public.project_text_sections 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_text_sections_project_id ON public.project_text_sections(project_id);

-- Create function to auto-create default sections for new projects
CREATE OR REPLACE FUNCTION public.create_default_text_sections()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.project_text_sections (project_id, section_key, title, content, sort_order) VALUES
    (NEW.id, 'puustonpoisto', 'Puustonpoisto', 'Ennen rakennustöiden aloittamista poistetaan määritellyltä tiealueelta puut, vesakko ja kasvillisuus, jotka haittaavat ojitusta tai tierungon muotoilua. Työt toteutetaan hallitusti siten, että ympäröivä luonto ja kuivatus säilyvät toimivina. Tiealueella sijaitsevat puut kaadetaan ja jätetään maanomistajan maalle asianmukaisesti.

Suunnitelmakartalla osoitettujen laskuojien varsilta poistetaan välttämättömät puut siten, että laskuojan kaivaminen työkoneella on mahdollista. Jos työmaan osalta on erikseen sovittu muusta käsittely- tai sijoitustavasta, toimitaan tämän sopimuksen mukaisesti.

Jos työmaan osalta on erikseen sovittu muu käsittely- tai sijoitustapa, toimitaan sen mukaisesti.', 1),
    (NEW.id, 'sivu_ja_laskuojat', 'Sivu- ja laskuojat', 'Tien reunoille muodostuneet palteet poistetaan, ja runko muotoillaan noin 3–5 % sivukaltevuuteen, jotta pintavedet ohjautuvat tehokkaasti sivuojin.

Ojat perataan ja luiskaus tehdään suunnitelmakartan osoittamilla paikoilla. Purkupisteet avataan niin, että veden virtaus on esteetön. Tarvittaessa ojat syvennetään tai levennetään riittävän kuivatusvaikutuksen varmistamiseksi. Suunnitelmakartalla osoitetut laskuojat avataan niin, että veden virtaus on esteetön. Tarvittaessa ojat syvennetään tai levennetään riittävän kuivatusvaikutuksen varmistamiseksi.', 2),
    (NEW.id, 'ojan_kaivumaiden_kasittely', 'Ojan kaivumaiden käsittely', 'Ojan kaivussa syntyvät maat levitetään ja maisemoidaan ensisijaisesti ojan vastapenkkaan tai ojaluiskaan, jolloin ne sulautuvat maastoon luonnollisesti. Tarvittaessa kaivumaat kuljetetaan tiekunnan osoittamalle läjitysalueelle, jossa ne tasataan ja maisemoidaan ympäristöön sopiviksi.

Jos työmaan osalta on erikseen sovittu muu käsittely- tai sijoitustapa, toimitaan sen mukaisesti.', 3),
    (NEW.id, 'louhinnasta_syntyvat_louheet', 'Louhinnasta syntyvät louheet', 'Louhinnasta syntyvät louheet voidaan hyödyntää maisemoinnissa sijoittamalla ne ojan vastapenkkaan tai muuhun maastoon sopivaan kohtaan. Mikäli louhetta syntyy määrällisesti paljon tai sen sijoittaminen maisemallisesti ei ole tarkoituksenmukaista, louhe kuljetetaan pois työmaa alueelta tiekunnan osoittamaan paikkaan tai hyväksyttyyn vastaanottopaikkaan.

Jos työmaan osalta on erikseen sovittu muu käsittely- tai sijoitustapa, toimitaan sen mukaisesti.', 4),
    (NEW.id, 'rummut_ja_liittymat', 'Rummut ja liittymät', 'Rumpuina käytetään SN8-lujuusluokan muoviputkia, jotka ovat ensisijaisesti muhvittomia.

Suunnitelmassa ilmoitetut rummun halkaisijat tarkoittavat aina sisähalkaisijan mittoja.

Kaikille asennettaville rummuille rakennettava murskearina sekä murskeesta tehty ympärystäyttö. Rumpujen asennuksessa on noudatettava valmistajan ohjeita. Pituuskaltevuuden tulee olla vähintään 1 %, jotta padotusta ei synny.

Liittymärummut uusitaan suunnitelman osoittamiin liittymiin. (liittymärummun putken kustannuksista vastaa lähtökohtaisesti liittymän omistaja)', 5),
    (NEW.id, 'maakivet', 'Maakivet', 'Tien pinnassa olevat maakivet poistetaan kaivamalla, ja kuopat täytetään tierungon materiaaliin soveltuvalla maa-aineksella.', 6),
    (NEW.id, 'rakennekerrokset', 'Rakennekerrokset ja kantavuuden parantaminen', 'Heikosti kantavilla tieosuuksilla parannetaan rakennetta asentamalla suodatinkangas ja lisäämällä kantavia murskekerroksia suunnitelmassa osoitetuille paaluväleille.

Suodatinkankaan tehtävänä on estää pohjamaan hienoaineksen sekoittuminen kantavaan rakenteeseen.

Kantavuutta lisätään rakentamalla rakenteet seuraavasti:

- Pohjalle ajetaan 0–56 mm mursketta, joka toimii pääkantavana kerroksena.
- Sen päälle levitetään 0–32 mm murske kiilakiveksi, jolla saadaan aikaan tasainen ja tiivis pinta sekä hyvä kantavuus jatkorakenteille.

Kaikki materiaalit ja tiivistys tehdään Liikenneviraston ohjeen 38/2018 mukaisesti. Tarvittaessa käytetään geovahvistetta (esimerkiksi pehmeillä tai routivilla pohjilla) lisäämään kantavuutta ja vähentämään painumia.', 7),
    (NEW.id, 'kulutuskerros', 'Kulutuskerros', 'Tierunko muotoillaan 3–5 % sivukaltevuuteen ennen pintamurskeen levitystä. Levitetään 0–16 mm KaM- tai SrM-mursketta, tiivistettynä noin 50 mm vahvuiseksi kerrokseksi. Liittymät viimeistellään murskelipoilla.', 8),
    (NEW.id, 'kaapelit_ja_johdot', 'Kaapelit ja johdot', 'Ennen kaivutöitä on tilattava ja tehtävä kaapelinäyttö.

Kaapeli- ja johtoselvitys osoitteesta www.kaivulupa.fi

Näyttöihin osallistuvat työtä suorittavat koneurakoitsijat.', 9),
    (NEW.id, 'yleiset_asiat', 'Yleiset asiat', '', 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for new projects
DROP TRIGGER IF EXISTS create_default_sections_trigger ON public.projects;
CREATE TRIGGER create_default_sections_trigger
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.create_default_text_sections();