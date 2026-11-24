# Umami Dashboard

Compact, configureerbaar dashboard voor een bestaande self-hosted Umami-installatie. React/TypeScript voor de interface, een kleine Node.js-API voor uitsluitend leesverzoeken naar Umami, en Docker Compose voor de VM.

Er is **geen eigen database**. De API-key blijft op de server. Analytics worden alleen kort in het geheugen gecachet. Alleen weergavevoorkeuren (kolommen, compactheid, sortering en vastgezette applicaties) worden in de browser opgeslagen. De applicatie bevat geen eigen tracker en laadt geen externe fonts of scripts.

## Eerste keer starten

Vereist: Docker Engine met Compose op een Linux-VM. De images gebruiken de goedgekeurde basis `node:26.13.1-bookworm-slim` en `nginx:1.30.8-alpine`.

```sh
cp .env.example .env
```

Vul in `.env` het adres en de API-key van Umami in:

```dotenv
UMAMI_URL=http://private-umami-host:3000
UMAMI_API_KEY=jouw-eigen-api-key
DEMO_MODE=false
```

Gebruik het interne HTTP(S)-adres van je Umami-installatie; een afsluitend `/api` mag, maar is niet nodig. `localhost` in een container verwijst naar die container. Bij een andere VM gebruik je het private VM-adres. Bij dezelfde VM kun je de API-container verbinden met het bestaande Docker-netwerk van Umami en de servicenaam gebruiken. Stuur de key nooit via een onbeveiligd publiek HTTP-adres.

```sh
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:18470/health
```

Het dashboard luistert uitsluitend op `127.0.0.1:18470` van de VM. De API heeft geen gepubliceerde hostpoort. Het health-endpoint controleert het API-proces; een eventuele storing van Umami wordt apart in het dashboard getoond. Bij ontbrekende credentials geeft het dashboard een configuratiemelding en schakelt het niet automatisch naar demodata.

Zolang de toegang nog niet is ingericht kun je veilig lokaal kijken met een SSH-tunnel:

```sh
ssh -L 18470:127.0.0.1:18470 gebruiker@vm
```

Open vervolgens `http://127.0.0.1:18470` op je eigen computer.

Voor voorbeeldgegevens zet je tijdelijk **expliciet** `DEMO_MODE=true` en voer je `docker compose up -d --force-recreate api` uit. Er verschijnt een duidelijke demobanner. Terug naar echte gegevens: `DEMO_MODE=false`, credentials invullen en de API opnieuw aanmaken.

## Applicaties en weergave

`config/dashboard.json` bepaalt de standaardinstellingen. Het bestand is alleen-lezen gemount. Na een configuratiewijziging: `docker compose restart api`.

Standaard haalt `discovery: "auto"` alle applicaties op die de API-key mag zien, inclusief teamapplicaties en volgende pagina’s. Nieuwe applicaties verschijnen bij een volgende verversing. Geef de eigenaar van de key dus ook toegang tot nieuwe applicaties.

Bijvoorbeeld, één applicatie aanpassen en een andere verbergen:

```json
{
  "title": "Mijn applicaties",
  "timezone": "Europe/Amsterdam",
  "discovery": "auto",
  "refreshSeconds": 60,
  "cacheSeconds": 30,
  "columns": ["active", "visitors", "pageviews", "visits", "bounce", "trend"],
  "sites": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Klantportaal",
      "group": "Zakelijk",
      "color": "#a8d5a2",
      "order": 1
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "hidden": true
    }
  ]
}
```

Vervang de voorbeeld-ID’s door echte Umami-website-ID’s. Met `discovery: "manual"` worden alleen zichtbare ID’s uit `sites` opgehaald. Namen en domeinen komen ook dan uit Umami, tenzij je ze overschrijft. Handmatig vermelde ID’s worden bij `auto` alleen als aanpassing gebruikt en moeten zichtbaar zijn voor de key.

In het dashboard kun je de periode, groep, zoekfilter, zichtbare kolommen en compactheid wijzigen. De compacte samenvattingsbalk volgt het groeps- en zoekfilter. Details staan standaard dicht: selecteer een applicatie voor de grafiek en top pagina’s, verwijzers, events en landen. Klik opnieuw op de applicatie of op ‘Details inklappen’ om terug te gaan naar alleen het overzicht. Detailopvragen worden pas gedaan wanneer je details opent. Er zijn geen mutatieroutes naar Umami. Voeg later een informatieblok toe via de getypeerde API in `apps/api` en de componenten in `apps/web`.

### Betekenis van de cijfers

- Vandaag begint om middernacht in de ingestelde tijdzone; 7 en 30 dagen gebruiken een terugkijkvenster met dezelfde lokale tijd. Zomer- en wintertijd worden meegenomen.
- De exacte huidige en vergelijkingsperiode staan boven de tabel. Vandaag wordt vergeleken met gisteren van middernacht tot hetzelfde lokale tijdstip; rond zomer- en wintertijd kan de verstreken duur verschillen. Bij 7 en 30 dagen gebruiken we het voorafgaande kalenderdagenvenster, zonder overlappende eindpunten. De API vraagt de vergelijkingscijfers apart op en gebruikt niet de impliciete vergelijking van Umami.
- De tabel toont zowel procentuele als absolute verschillen per applicatie. Als het vorige aantal nul was, toont de interface `nieuw` of `0%`, met het absolute verschil ernaast.
- De grafieken tonen pageviews; actief is het aantal bezoekers in de laatste vijf minuten volgens Umami.
- De grafieken behouden alle verstreken uur- of dagvakken, inclusief lege vakken. Bij een geslaagde tijdreeksopvraag worden door Umami weggelaten lege vakken als nul weergegeven. Een expliciete onbekende waarde blijft onbekend; een mislukte opvraag levert geen nulwaarden op. De tijdas gebruikt werkelijke tijdstippen en de ingestelde tijdzone. Dagvakken op de grenzen van het terugkijkvenster kunnen gedeeltelijk zijn.
- De grote grafiek heeft een numerieke schaal, tijdlabels, arcering bij onbekende vakken en een uitklapbare tabel met exacte waarden. Kleine trends hebben elk een eigen schaal; ze vergelijken de vorm van een trend, niet het volume tussen applicaties. Als Umami het herhaalde uur bij wintertijd niet kan onderscheiden, tonen we dat uur als onbekend in plaats van hetzelfde aantal tweemaal te tellen.
- Bezoekersaantallen en actieve bezoekers worden **per applicatie opgeteld**, zonder ontdubbeling tussen applicaties.
- Bounce is `bounces / visits`; gemiddelde sessieduur is `totaltime / visits`.
- Een mislukte meting wordt `—`, met een waarschuwing. Totalen geven aan wanneer ze gedeeltelijk zijn. Bij een mislukte verversing blijven de laatst opgehaalde cijfers herkenbaar met tijdstip en foutmelding.
- Sorteren kan via de kolomkoppen of de sorteerkeuze, ook op procentuele bezoekersverandering. Ontbrekende waarden staan onderaan. Vastgezette applicaties (ster) staan boven de overige applicaties en blijven binnen die groep sorteerbaar. De voorkeursvolgorde volgt de configuratie. Automatische kleuren zijn gekoppeld aan het applicatie-ID en veranderen niet als de API een andere volgorde teruggeeft; een expliciete kleur in de configuratie heeft voorrang.
- ‘Vandaag’ ververst volgens `refreshSeconds` (standaard 60 seconden). Overzichten en details voor 7 en 30 dagen worden minimaal vijf minuten gecachet en de browser ververst het overzicht niet vaker dan elke vijf minuten. Actieve bezoekers worden daar apart opgehaald volgens `refreshSeconds`, zodat de historische grafieken niet steeds opnieuw worden opgevraagd. Op verborgen tabbladen stoppen automatische opvragen.
- Met ‘Pauzeren’ zet je automatische updates stil. Handmatig verversen en een andere periode kiezen blijven werken. ‘Hervatten’ vraagt direct het overzicht opnieuw op. Geopende details blijven tijdens verversen zichtbaar; fouten laten herkenbaar de laatst opgehaalde details staan.
- Handmatig verversen passeert de gewone cache na een gedeelde wachttijd van vijf seconden sinds de vorige opvraag. Gelijktijdige opvragen worden samengevoegd. Dit voorkomt een onbeperkte reeks nieuwe Umami-opvragen bij snel klikken of meerdere geopende tabbladen.
- ‘Bezoeken’ correspondeert met Umami `visits` en is iets anders dan een Umami-sessie. Bouncepercentage en gemiddelde bezoekduur zijn niet van toepassing zonder bezoeken; de interface toont dan `—`. De uitklapbare uitleg onder de tabel beschrijft de meetdefinities en beperkingen.

## Privétoegang: Tailscale als eerste keuze

Installeer Tailscale op de VM en laat Serve de lokale dashboardpoort via HTTPS beschikbaar maken:

```sh
sudo tailscale serve --bg http://127.0.0.1:18470
tailscale serve status
```

Gebruik de HTTPS-URL die Tailscale teruggeeft. Beperk in je tailnetbeleid de bereikbaarheid van deze VM op poort 443 tot jouw gebruiker/apparaten en verwijder eventuele bredere grants voor deze toegang. Controleer vanaf een apparaat buiten het tailnet dat het dashboard niet bereikbaar is. Er is geen eigen dashboardlogin: de toegang wordt aan de netwerkgrens afgedwongen.

Gebruik **Serve**, niet Funnel: Funnel maakt de dienst publiek. Voor deze opzet is Nginx Proxy Manager niet nodig. Andere diensten kunnen NPM gewoon blijven gebruiken.

## Alternatief: tunnel met identiteit

Bijvoorbeeld Cloudflare Tunnel **plus Cloudflare Access**, met een allow-policy uitsluitend voor jouw identiteit en bij voorkeur MFA. Een tunnel op zichzelf biedt geen gebruikersauthenticatie. Een tunnelproces op de VM kan `http://127.0.0.1:18470` als origin gebruiken. Een tunnel in een aparte container heeft een gedeeld Docker-netwerk nodig; zijn eigen localhost is niet de VM.

Bescherm de volledige hostname, inclusief `/api/`, en voorkom een tweede publieke route rechtstreeks via NPM of een gepubliceerde Docker-poort. De dashboardcode blijft gelijk wanneer je later van toegangsmethode wisselt.

### Nginx Proxy Manager als tussenstap

Wanneer NPM op **dezelfde Docker-host** draait, kun je de webcontainer op zijn bestaande externe Docker-netwerk aansluiten:

```dotenv
NPM_NETWORK=naam-van-bestaand-npm-netwerk
```

```sh
docker compose -f compose.yaml -f deploy/compose.npm.yaml up -d
```

NPM kan dan naar `http://umami-dashboard:80` proxyen. De API staat niet op het NPM-netwerk. De localhost-binding blijft bestaan voor Tailscale/SSH.

Deze overlay regelt alleen netwerkbereikbaarheid, **geen authenticatie**. Maak pas een dashboard-proxyhost aan wanneer die via Tailscale of een identiteitcontrolerende toegangslaag afgeschermd is. Een normale publieke NPM-proxyhost zou dit dashboard zonder login openbaar maken. Als NPM op een andere VM draait, gebruik je een afgeschermde verbinding tussen de VM’s; deze Docker-netwerkoverlay werkt dan niet.

## Bestaande Umami afschermen

De keuze `ghcr.io/umami-software/umami:latest` vertelt niet exact welke release momenteel draait. Controleer die in Umami of bij de container voordat je wijzigingen doorvoert. Deze adapter volgt de actuele self-hosted API met `Authorization: Bearer <API-key>` en ondersteunt ook de oudere geneste statistiekvorm. De daadwerkelijke koppeling moet op jouw installatie worden gecontroleerd.

Scherm de beheerinterface en lees-API aan de reverse-proxykant af. Publieke websites moeten het trackerscript en de verzamelroutes wel kunnen blijven bereiken, standaard `/script.js` en `/api/send`. Pas dit aan bij aangepaste trackerpaden of aanvullende trackingfuncties van jouw release. Blokkeer dus niet zonder onderscheid alle `/api/`-routes.

`DISABLE_LOGIN=1` schakelt de loginpagina uit; het is geen volledige netwerkafscherming. Bewaar een private beheerroute voor nieuwe applicaties en keybeheer. Test vóór en na een wijziging zowel een echte pageview als een nieuwe API-opvraag vanuit het dashboard. Dit project wijzigt je bestaande Umami- of NPM-configuratie niet.

## Productie met vooraf gebouwde images

Stel lokaal `IMAGE_REGISTRY`, `IMAGE_TAG` en de echte Git-repository-URL in `IMAGE_SOURCE` in `.env` in. Maak een Git-commit, meld Docker aan bij je registry en push:

```sh
npm run docker:push
```

Het script bouwt `linux/amd64,linux/arm64`, zet OCI-labels en pusht beide images. Het leest alleen de `IMAGE_*`-instellingen uit `.env`; de Umami-key wordt niet als buildargument gebruikt.

Op de VM heb je alleen deze bestanden nodig:

```text
umami-dashboard/
  compose.yaml            # kopie van deploy/compose.prod.yaml
  .env                    # runtimecredentials en IMAGE_REGISTRY/IMAGE_TAG
  config/dashboard.json
```

```sh
docker compose up -d
```

De productiecompose bouwt niets en haalt de images op. Kopieer voor NPM desgewenst ook de netwerkoverlay en pas het pad in het commando aan. Gebruik dezelfde projectnaam en bestandenset bij volgende Compose-commando’s.

## Lokaal ontwikkelen en controleren

Gebruik Node.js 26.13.1 of nieuwer binnen versie 26.

```sh
npm ci
npm run dev:api
npm run dev:web
```

De lokale webserver draait op `http://127.0.0.1:18471` en stopt met een foutmelding als die poort bezet is. De API leest de root-`.env`; Vite proxy’t `/api/` naar `127.0.0.1:18472`. Voor een expliciete demo zonder `.env`:

```sh
npm run build -w @dashboard/shared
node --import tsx apps/api/src/main.ts --demo
# In een tweede terminal:
npm run dev:web
```

```sh
npm run typecheck
npm test
npm run build
```

De API-tests gebruiken een lokale nep-Umami-server voor authenticatie, paginering, caching, read-only gedrag, handmatige selectie, tijdzones en gedeeltelijke fouten. Ze gebruiken geen echte API-key.

Structuur: `apps/api` bevat de configuratie, Umami-adapter en HTTP-routes; `apps/web` bevat de interface; `packages/shared` bevat gedeelde types; `deploy` bevat nginx en productiecompose. De API beperkt gelijktijdige upstreamverzoeken tot zes, gebruikt timeouts en volgt geen redirects met de key.

## Licentie en bronnen

AGPL-3.0-or-later, zie [LICENSE](LICENSE).

- [Umami API en authenticatie](https://docs.umami.is/docs/api/authentication)
- [Umami veelgebruikte endpoints](https://docs.umami.is/docs/api/common-endpoints)
- [Umami omgevingsvariabelen](https://docs.umami.is/docs/environment-variables)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
