# Beveiliging

Dit dashboard heeft geen eigen aanmelding. Geef uitsluitend toegang via een afgeschermd netwerk, bijvoorbeeld Tailscale Serve met passend toegangsbeleid, of een tunnel met een identiteitcontrolerende toegangslaag zoals Cloudflare Access. Bescherm zowel de interface als alle `/api/`-routes.

De standaard Docker-configuratie publiceert de webpoort alleen op `127.0.0.1`. De API heeft geen gepubliceerde hostpoort. Een publieke Nginx Proxy Manager-proxyhost of tunnel zonder toegangscontrole kan analytics alsnog openbaar maken.

## Credentials en gegevens

- Bewaar de Umami-API-key uitsluitend in de runtime-`.env` van de API. Deel die niet via issues, screenshots, logs of frontendvariabelen.
- `.env` en kopieën daarvan worden uitgesloten van Git en de Docker-buildcontext. Alleen `.env.example` is bedoeld voor publicatie en bevat geen credentials.
- Configuratiebestanden worden wel bijgehouden in Git. Controleer namen, domeinen en applicatie-ID’s voordat je persoonlijke configuratie commit.
- De applicatie heeft alleen leesroutes naar Umami; de API-key zelf kan ruimere rechten hebben. Gebruik waar mogelijk een account met alleen de benodigde applicatietoegang.
- Gebruik voor verbindingen tussen verschillende hosts HTTPS of een beveiligd privénetwerk.

## Een kwetsbaarheid melden

Meld een kwetsbaarheid met gevoelige details via **Security → Report a vulnerability** op GitHub. Zet geen werkende credentials of privé-analytics in een openbaar issue. Trek een gelekte key direct in en maak een nieuwe aan; verwijdering uit de laatste commit verwijdert die niet uit de Git-geschiedenis.
