# Tievahti – Täydellinen Master Prompt uudelle projektille

> Kopioi tämä kokonaisuudessaan uuteen Lovable-projektiin pohjaksi.

---

## 1. YLEISKUVAUS

Rakennetaan **Tievahti** – yksityisteiden kunnossapidon suunnittelu- ja hallintasovellus. Sovellus on karttapohjainen GIS-työkalu, jossa käyttäjä piirtää tuotteita (rummut, kaiteet, murskeet, ojat jne.) kartalle, laskee kustannuksia kaavamoottorilla ja tuottaa rakennussuunnitelma-PDF:iä.

### Teknologiat
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Kartta**: MapLibre GL JS (v4.7+) + Maanmittauslaitoksen (MML) vektoritiilet
- **Backend**: Supabase (PostgreSQL, RLS, Edge Functions, Storage, Auth)
- **Kaavamoottori**: `expr-eval` (turvallinen matemaattinen lausekeparser)
- **Spatiaalinen analyysi**: `@turf/turf`
- **PDF**: `jspdf` + `jspdf-autotable`
- **Excel**: `xlsx`

---

## 2. TIETOKANTA – SQL-skeema

```sql
-- =============================================
-- TIEVAHTI DATABASE SCHEMA
-- =============================================

-- Enumit
CREATE TYPE public.app_role AS ENUM ('admin', 'edit', 'watch');

-- Sähköpostidomainien sallintataulu (login-rajoitus)
CREATE TABLE public.allowed_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  project_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Työtyypit (globaali kirjasto: kaivinkone, kuorma-auto jne.)
CREATE TABLE public.work_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 25.5,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tuotekatalogi (tuotteet + toimenpiteet)
CREATE TABLE public.catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('product', 'operation')),
  unit TEXT NOT NULL DEFAULT 'kpl',
  unit_price NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 25.5,
  default_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Kaavat (expr-eval lausekkeet)
  quantity_formula TEXT,       -- esim. "pituus_m * leveys_m * paksuus_m"
  name_formula TEXT,           -- esim. "'Rumpu Ø' + halkaisija + 'mm'"
  price_formula TEXT,          -- esim. "if(param('materiaali') == 'betoni', 85, 65)"
  -- Karttatyyli
  marker_style JSONB DEFAULT '{"color":"#505050","shape":"circle","size":24}'::jsonb,
  measure_type INTEGER NOT NULL DEFAULT 2,  -- 1=tievälillinen, 2=paikallinen
  allowed_geometries TEXT[] NOT NULL DEFAULT ARRAY['point'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  default_images JSONB DEFAULT '[]'::jsonb,
  default_instruction_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Koosteet: Toimenpide → Alituotteet
CREATE TABLE public.catalog_composition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  child_item_id UUID NOT NULL REFERENCES catalog_items(id),
  quantity_factor_formula TEXT NOT NULL DEFAULT '1',
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Työmäärät: Tuote → Työtyypit (montako tuntia per yksikkö)
CREATE TABLE public.catalog_item_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  work_type_id UUID NOT NULL REFERENCES work_types(id),
  hours_per_unit NUMERIC NOT NULL DEFAULT 0,
  hours_formula TEXT,  -- esim. "(0.2 / length) + (width / 8000)"
  description TEXT
);

-- Projektit
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,
  description TEXT,
  road_geometry JSONB,  -- { segments: [[[lat,lon],...], ...], coordinates: [...], source, totalLength }
  staking_origin JSONB, -- [lat, lon] paalutuksen 0-piste
  map_center JSONB,
  zoom_level INTEGER DEFAULT 15,
  vat_percentage NUMERIC DEFAULT 25.5,
  currency TEXT DEFAULT 'EUR',
  products JSONB DEFAULT '[]'::jsonb,  -- Legacy, siirretään project_items-tauluun
  -- Tiekunta-tiedot
  project_type TEXT,
  tiekunta TEXT,
  kayttooikeusyksikkotunnus TEXT,
  kunta TEXT,
  kohdeosoite TEXT,
  osakas_count INTEGER DEFAULT 0,
  yksikko_count INTEGER DEFAULT 0,
  vastuuhenkilo_name TEXT,
  vastuuhenkilo_phone TEXT,
  vastuuhenkilo_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projektiroolit (RBAC)
CREATE TABLE public.project_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role app_role NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Globaalit käyttäjäroolit (domainipohjainen)
CREATE TABLE public.user_global_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  role app_role NOT NULL DEFAULT 'watch',
  set_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projektituotteet (karttakohteet)
CREATE TABLE public.project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id),
  geometry JSONB NOT NULL,  -- { type: 'point'|'line'|'polygon', coordinates: [...] }
  user_parameters JSONB DEFAULT '{}'::jsonb,
  string_parameters JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  photos JSONB,
  visible BOOLEAN NOT NULL DEFAULT true,
  locked BOOLEAN NOT NULL DEFAULT false,
  style_overrides JSONB,
  category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL,
  chainage_start NUMERIC,
  chainage_end NUMERIC,
  offset_m NUMERIC,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'mass_calc'
  mass_calc_run_id UUID REFERENCES mass_calc_runs(id),
  mass_calc_branch_id UUID REFERENCES road_branches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projektin kategoriat (vaiheistus/ryhmittely)
CREATE TABLE public.project_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projektin tekstiosiot (rakennussuunnitelman tekstit)
CREATE TABLE public.project_text_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lisäkustannukset (manuaaliset)
CREATE TABLE public.custom_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tiehaarat (kantavuusmittaus)
CREATE TABLE public.road_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_bearing_capacity NUMERIC NOT NULL DEFAULT 100,
  road_width NUMERIC NOT NULL DEFAULT 4.0,
  geometry JSONB,  -- { coordinates: [[lat,lon],...], segments: [...] }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kantavuusmittauspisteet (FWD-datasta)
CREATE TABLE public.measurement_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES road_branches(id) ON DELETE CASCADE,
  station NUMERIC NOT NULL,       -- paalu (m)
  measured_value NUMERIC NOT NULL, -- kantavuus (MN/m²)
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Massalaskenta-ajot
CREATE TABLE public.mass_calc_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_ids TEXT[] DEFAULT '{}',
  settings JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Massalaskenta-asetukset (per projekti)
CREATE TABLE public.mass_calc_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  influence_distance_m NUMERIC NOT NULL DEFAULT 25,
  cut_length_m NUMERIC NOT NULL DEFAULT 100,
  surface_thickness_m NUMERIC NOT NULL DEFAULT 0.05,
  spring_factor NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### RLS-funktiot (tärkeimmät)
```sql
-- Pääseekö käyttäjä projektiin (globaali rooli tai projekti-spesifi)
CREATE FUNCTION can_access_project(_project_id UUID, _user_id UUID) RETURNS BOOLEAN;
-- Voiko muokata projektia
CREATE FUNCTION can_edit_project(_project_id UUID, _user_id UUID) RETURNS BOOLEAN;
-- Onko globaali admin
CREATE FUNCTION is_global_admin(_user_id UUID) RETURNS BOOLEAN;
-- Tievahti.fi -domainin tarkistus
CREATE FUNCTION is_tievahti_domain(_user_id UUID) RETURNS BOOLEAN;
-- Haetaan projektin rooli
CREATE FUNCTION get_project_role(_project_id UUID, _user_id UUID) RETURNS app_role;
-- Haetaan globaali rooli
CREATE FUNCTION get_user_global_role(_user_id UUID) RETURNS app_role;
```

---

## 3. TYYPIT (TypeScript)

### CatalogParameter
```typescript
interface CatalogParameter {
  slug: string;        // Kaavassa käytetty muuttujanimi, esim. "leveys_m"
  label: string;       // Näyttönimi, esim. "Leveys (m)"
  unit?: string;       // "m", "mm", "kpl"
  type?: 'number' | 'string' | 'select' | 'boolean';  // oletus: 'number'
  default: number;
  stringDefault?: string;  // string/select-tyypille
  min?: number;
  max?: number;
  step?: number;
  options?: number[];       // valintadropdown (number)
  stringOptions?: string[]; // select-tyypille
}
```

### MarkerStyle (karttatyyli)
```typescript
interface MarkerStyle {
  color: string;          // Hex-väri
  shape: 'circle' | 'square' | 'triangle' | 'custom';
  size: number;           // pikseleinä
  image?: string;         // Custom marker-kuvan URL
  lineWidth?: number;     // Viivan leveys pikseleissä
  dashArray?: string;     // Katkoviiva, esim. '8, 4'
  opacity?: number;       // 0-1
  strokeOffset?: number;  // Offset tiestä metreinä
  renderOrder?: number;   // Piirtojärjestys: 0=tien takana, 1=oletus, 2+=päällä
  fillIcon?: string;      // Lucide-ikonin nimi fill-patterniksi
}
```

### ProjectItemGeometry
```typescript
type ProjectItemGeometry =
  | { type: 'point'; coordinates: [lat, lon] }
  | { type: 'line'; coordinates: [lat, lon][] }
  | { type: 'polygon'; coordinates: [lat, lon][] };
```

### RoadGeometry (MultiLineString)
```typescript
interface RoadGeometry {
  id: string;
  name: string;
  coordinates: [lat, lon][];        // Legacy: ensimmäinen segmentti
  segments: [lat, lon][][];         // MultiLineString
  source: 'search' | 'drawn';
  totalLength: number;              // metriä
}
```

---

## 4. KARTTA – MapLibre GL JS + MML

### Konfiguraatio
```typescript
const MML_API_KEY = import.meta.env.VITE_MML_API_KEY;

// Taustakartta (vektoritiilet)
const MML_STYLE_URL = `https://avoin-karttakuva.maanmittauslaitos.fi/vectortile/stylejson/v20/backgroundmap.json?TileMatrixSet=WGS84_Pseudo-Mercator&api-key=${MML_API_KEY}`;

// Kiinteistörajat (WMS-taso, zoom 13+)
const MML_KIINTEISTORAJAT = `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/kiinteistojaotus/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${MML_API_KEY}`;

// Rakennukset
const MML_RAKENNUKSET = `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${MML_API_KEY}`;

// Attribuutio
const MML_ATTRIBUTION = 'Aineisto: Maanmittauslaitos Taustakarttasarja 02/2026';
```

### Karttatasot
1. **Taustakartta** – MML vektoritiilet (aina päällä)
2. **Kiinteistörajat** – WMS-taso, näkyy zoom ≥ 13
3. **Tiegeometria** – Projektin tie (sininen viiva)
4. **Tuotteet** – Kartalle piirretyt pisteet, viivat, polygonit
5. **Kantavuusmittauspisteet** – FWD-data värikoodattuna
6. **Korjausosuudet** – Massalaskennan tulokset

### Piirtotoiminnot
- **Piste**: Klikkaa kartalle
- **Viiva (road-snap)**: Klikkaa alku- ja loppupiste → snap tiehen (`extractRoadSegment`)
- **Viiva (vapaa)**: Klikkaa pisteitä → yhdistä viivaksi
- **Polygoni**: Klikkaa pisteitä → sulje polygoni
- **GPS-seuranta**: `watchPosition` → tallenna pisteitä 5s välein

### Kiinteistöhaku & hover
- Hover: `setFeatureState` korostaa kiinteistöä
- Haku: `flyTo` + korostus tietyn kiinteistötunnuksen perusteella

---

## 5. KAAVAMOOTTORI (expr-eval)

### Turvallisuus
```typescript
const safeParser = new Parser({ allowMemberAccess: false });
const MAX_FORMULA_LENGTH = 500;
const DANGEROUS_PATTERNS = /(__proto__|constructor|prototype|...)/i;

function isFormulaSafe(formula: string): boolean {
  if (formula.length > MAX_FORMULA_LENGTH) return false;
  if (DANGEROUS_PATTERNS.test(formula)) return false;
  return true;
}
```

### evaluateFormula
Tukee:
- Matematiikkaa: `pituus_m * leveys_m * paksuus_m`
- `if(condition, trueVal, falseVal)`: `if(halkaisija > 600, 120, 85)`
- `param("slug")` string-vertailuihin: `if(param("materiaali") == "betoni", 85, 65)`
- AND/OR: `if(param("tyyppi") == "betoni" AND halkaisija > 300, 150, 80)`
- Eurooppalainen desimaalipilkku: `2,4` → `2.4`

### evaluateNameFormula
Dynaaminen tuotenimi: `"'Rumpu Ø' + halkaisija + 'mm'" → "Rumpu Ø300mm"`

### evaluatePriceFormula
Dynaaminen yksikköhinta parametreista.

### calculateWorkHours
Kaksi tyyliä:
1. "tunnit per yksikkö" (oletus): `hours = quantity × formulaResult`
2. "kokonaistunnit" (kaava sisältää `quantity`/`maara_kpl`): `hours = formulaResult`

### calculateQuantity
```typescript
function calculateQuantity(item: CatalogItem, context: CalculationContext): number {
  const variables = {
    ...context.params,
    length: context.length ?? params.pituus ?? 1,
    pituus: context.length ?? params.pituus ?? 1,
    area: context.area ?? params.ala ?? 1,
  };
  
  if (item.quantityFormula) {
    return evaluateFormula(item.quantityFormula, variables, context.stringParams);
  }
  
  // Oletus: piste=1, viiva=pituus, polygoni=pinta-ala
  if (context.length) return context.length;
  if (context.area) return context.area;
  return 1;
}
```

### Kustannuslaskenta
```
Product:
  materialCost = quantity × unitPrice (tai priceFormula)
  workCost = Σ(workReq.hours × workType.hourlyRate)
  total = materialCost + workCost

Operation (koontituote):
  cost = 0 (ei omaa hintaa)
  cost = Σ(child.materialCost + child.workCost)
  childQuantity = evaluateFormula(composition.quantityFactorFormula, parentVariables)
```

---

## 6. PARAMETRI-UTILITIES

### buildEffectiveParameters
Yhdistää käyttäjän tallentamat parametrit + katalogituotteen oletukset. Tukee legacy-nimien resolvointia:
```
pituus_m ↔ pituus ↔ length
leveys_m ↔ leveys ↔ width
paksuus_m ↔ paksuus ↔ thickness
maara_kpl ↔ maara ↔ quantity
```

### generateParameterOptions
Tuottaa dropdown-valinnat min/max/step perusteella. Fallback-arvot suomalaisille parametreille:
```
pituus: 0.5–30, step 0.5
leveys: 0.5–20, step 0.5
syvyys: 0.1–5, step 0.1
paksuus: 0.05–2, step 0.05
halkaisija: 50–1200, step 50
```

---

## 7. KANTAVUUSLASKENTA (Odemark)

### FWD-tiedoston parsinta
KUAB FWD -tiedoston rakenne:
- D-alkuiset rivit = mittauspisteet
- Sarake 0: Station (paalu m)
- Sarake 12: Emod (kantavuus MN/m²)
- Sarake 13-14: NMEA lat/lon (DDMM.MMMM / DDDMM.MMMM)

### Odemark-ratkaisija
```typescript
// Odemark-ennuste
function odemarkPredicted(ea: number, h: number): number {
  // ea = mitattu kantavuus, h = rakennekerroksen paksuus
  const A = 0.15;            // kuormituslevyn säde (m)
  const E_MOD_BASE = 280;    // murskeen E-moduuli (MN/m²)
  // ... laskenta
}

// Binäärihaku tarvittavalle paksuudelle
function solveOdemarkThickness(ea: number, target: number): number {
  // Iteroi h kunnes odemarkPredicted(ea, h) >= target
}
```

### Segmentointi
1. Huonot pisteet (hReq > 0) → vaikutusalueintervallit (±influenceDistance)
2. Yhdistä päällekkäiset intervallit
3. Pakota katkaisut cutLength välein
4. Segmenteille: KaM32 (max 100mm) + KaM56 (loput) + suodatinkangas (jos 56 > 0)
5. Koko haara: KaM16 pintamurske + ojankaivuu

### Materiaalit
- **KaM 0/16**: Pintamurske, paksuus = surfaceThicknessM (oletuksena 50mm)
- **KaM 0/32**: Kantava kerros, max 100mm/segmentti
- **KaM 0/56**: Jakava kerros, loput paksuudesta
- **Suodatinkangas**: Jos KaM56 > 0
- **Ojan kaivuu**: Koko haaran pituudelta
- **Tiheys**: 2.4 t/m³

### Ketjulaskenta (station → chainage)
- Projisoi mittauspisteet tien polylinelle
- Lineaarinen mapping: FWD-station → tien chainage
- Segmenttien pituudet chainagen perusteella

---

## 8. TIEGEOMETRIA-APUFUNKTIOT

```typescript
// Haversine-etäisyys (metriä)
function haversineDistance(p1: [lat,lon], p2: [lat,lon]): number;

// Lähin piste tiellä
function findClosestPointOnRoad(point, roadCoords): {
  point, segmentIndex, t, distance
};

// Tieosuuden leikkaus (road-snap piirtoon)
function extractRoadSegment(startPoint, endPoint, roadCoords): [lat,lon][];

// Pisteen snap tielle
function snapToRoad(point, roadCoords): [lat,lon];

// Polylinen kokonaispituus
function calculatePolylineLength(coords): number;

// Polylinen leikkaus etäisyysvälillä (massalaskenta)
function clipPolyline(coords, startDist, endDist): [lat,lon][];
```

---

## 9. SPATIAALINEN VAIHEISTUS (Turf.js)

### analysePolygonSelection
Piirretään polygoni kartalle → kohteet kategorisoidaan:
- **Pisteet**: `booleanPointInPolygon`
- **Viivat**: `lineSplit` polygonin rajalla → inside/outside osat
- **Polygonit**: Sentroidin sijainti

### mergeAdjacentSegments
Yhdistää vierekkäiset viivat jotka jakavat päätepisteen (snap threshold ~2m):
- Sama tuotemääritys + parametrit + kategoria
- Iteroi kunnes ei enää yhdistettävää

---

## 10. PAALU (CHAINAGE) -LASKENTA

```typescript
async function calculateChainage(projectId, geometry):
  // 1. Hae projektin tiehaarat (road_branches)
  // 2. Projisoi geometrian pisteet lähimmälle haaralle
  // 3. Laske etäisyys haaran alusta
  // 4. Palauta { chainageStart, chainageEnd? }
```

---

## 11. METSÄTILA (Forest Mode)

Mobiilioptimoitu kenttäkäyttöliittymä:

### Tilakone
```
BROWSE → ADD_LOCAL_POINT → (tallenna) → BROWSE
BROWSE → ADD_INTERVAL_LINE → (tallenna) → BROWSE
BROWSE → EDIT_GEOMETRY → (tallenna) → BROWSE
```

### Segmenttitilat
- **road-snap**: Klikkaa 2 pistettä → snap tiehen
- **gps-tracking**: `watchPosition` (5s intervalli) → kerrytä pisteitä
- **freeform**: Klikkaa pisteitä vapaasti

### GPS-seuranta
```typescript
navigator.geolocation.watchPosition(
  (pos) => addSegmentPoint([pos.coords.latitude, pos.coords.longitude]),
  (err) => console.error(err),
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
);
```

---

## 12. ROOLIEN HALLINTA

### Globaalit roolit (email-domainpohjainen)
- `admin`: kehitys@tievahti.fi → täydet oikeudet
- `edit`: @tievahti.fi → voi luoda projekteja, muokata katalogia
- `watch`: muut → vain katselu

### Projektiroolit
- `admin`: voi jakaa, poistaa, hallita jäseniä
- `edit`: voi muokata projektin sisältöä
- `watch`: vain katselu

### Efektiivinen rooli = max(globalRole, projectRole)

---

## 13. EXCEL-TUONTI/VIENTI

### Taulukkorakenne
1. **Tuotteet_Toimenpiteet**: Katalogituotteet
2. **Työtyypit**: Työtyyppien kirjasto
3. **Koosteet**: Toimenpide → alituotteet
4. **Työmäärät**: Tuote → työtyypit (tunnit/yksikkö)

### Tuonti
- Parsii Excel-tiedoston
- Validoi rivit (nimi, tyyppi, geometriat)
- Luo UUDET rivit (ei päivitystä/poistoa)
- Resolvo nimet → ID:t koosteiden ja työmäärien kytkentään

---

## 14. PDF-RAPORTOINTI

### Massalaskenta-PDF
- Per haara: mittaustaulukko, kantavuuskaavio, massaluettelo, yhteenveto
- Kantavuuskaavio: mittauspisteet vs. tavoitearvo (punainen katkoviiva)
- Massaluettelo: KaM16/32/56 paaluvälittäin
- Grand totals -sivu jos useampi haara

### Rakennussuunnitelma-PDF
- Projektin perustiedot (tiekunta, kohde, vastuuhenkilö)
- Tuotekategoriapohjainen erittely
- Kustannusyhteenveto (materiaalit + työ + ALV)
- Projektin tekstiosiot (puustonpoisto, ojitus jne.)

---

## 15. EDGE FUNCTIONS

### google-directions
- Google Directions API → tiegeometrian haku osoitteella
- Palauttaa polyline-pisteet

### google-places-search
- Google Places API → paikkahaku
- Palauttaa osoitteet, koordinaatit

### manage-project-role
- Lisää/poista/päivitä projektijäseniä
- Hakee käyttäjän sähköpostilla (`auth.users`)
- Tarkistaa kutsujan oikeudet

### check-email-domain
- Tarkistaa onko sähköpostidomain sallittu (rekisteröinnin yhteydessä)

---

## 16. KONTEKSTIT (React Context)

1. **AuthContext**: Session, user, signOut
2. **ProjectContext**: Projektin CRUD, tuotteiden hallinta, autosave, realtime
3. **CatalogContext**: Katalogituotteiden CRUD, työtyypit, koosteet
4. **RoleContext**: Roolitarkistukset, jäsenhallinta
5. **ForestModeContext**: Metsätilan tilakone
6. **BearingCapacityContext**: Kantavuusmittaus, haarat, mittauspisteet
7. **CategoryFilterContext**: Kategoriasuodatus kartalla
8. **RoadGeometryEditorContext**: Tiegeometrian muokkaus
9. **ItemClassificationContext**: Kohteiden luokittelu/vaiheistus

---

## 17. REALTIME

```typescript
// Kuuntele project_items muutoksia (toisen käyttäjän tekemät)
supabase.channel(`project_items:${projectId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'project_items',
    filter: `project_id=eq.${projectId}`,
  }, () => refetchDbItems())
  .subscribe();

// Kuuntele projektin metadata-muutoksia (road_geometry jne.)
supabase.channel(`projects:${projectId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'projects',
    filter: `id=eq.${projectId}`,
  }, (payload) => updateLocalState(payload.new))
  .subscribe();
```

---

## 18. AUTOSAVE

- 800ms debounce kaikille muutoksille
- Tarkistaa `can_edit_project` ennen tallennusta
- Watch-käyttäjä: ohitetaan hiljaisesti
- SaveStatus: `idle` → `saving` → `saved` | `error`

---

## 19. LEGACY-MIGRAATIO

Vanhat JSONB-tuotteet (`projects.products[]`) siirretään `project_items`-tauluun automaattisesti:
1. Ladattaessa projekti, tarkistetaan onko `products`-kentässä dataa
2. Insertataan puuttuvat rivit `project_items`-tauluun
3. Tyhjennetään `products`-kenttä

---

## 20. ALOITUSOHJE

1. Aloita karttanäkymästä: MapLibre + MML taustakartta
2. Lisää Supabase-integraatio ja luo tietokanta yllä olevan skeeman mukaan
3. Rakenna katalogijärjestelmä (tuotteet + parametrit + kaavat)
4. Lisää karttapiirtotoiminnot (piste, viiva, polygoni, road-snap)
5. Integroi kaavamoottori kustannuslaskentaan
6. Lisää metsätila (Forest Mode) mobiililaitteille
7. Rakenna kantavuuslaskenta (FWD-parsinta + Odemark)
8. Lisää PDF/Excel-raportointi
9. Toteuta roolien hallinta ja realtime-synkronointi

### Tärkeät ympäristömuuttujat
```
VITE_MML_API_KEY=<Maanmittauslaitoksen API-avain>
VITE_SUPABASE_URL=<Supabase URL>
VITE_SUPABASE_ANON_KEY=<Supabase anon key>
```
