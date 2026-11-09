# Learning-Fih (iPhone)

Az Android-os dolgozat naptár iPhone-os változata, diákok számára.

## Funkciók

- Saját naptár saját órarenddel
- Dolgozat mentése
- Dolgozat előtti figyelmeztető értesítés
- Sötét és világos téma
- Teljesen lokálisan működik

## Felépítés

| Mappa | Tartalom |
| --- | --- |
| `web/` | Az oldalak (HTML, CSS, JavaScript) – ugyanazok, mint az Android-os változatban |
| `ios/DolgozatNaptar/` | A Swift kód: adatbázis, bejelentkezés, értesítések, fájlok |
| `ios/project.yml` | Ebből készíti el az Xcode-projektet a buildgép (XcodeGen) |
| `.github/workflows/ios-build.yml` | A GitHub Actions build, ami az `.ipa` fájlt készíti |

## Build

Minden `main` ágra történő push után a GitHub Actions egy Mac gépen lefordítja az alkalmazást.
Az eredmény a futás oldalán, az **Artifacts** résznél tölthető le (`DolgozatNaptar-ipa`, benne a `DolgozatNaptar.ipa`).

## Telepítés iPhone-ra (Windowsról)

1. Telepítsd a [Sideloadly](https://sideloadly.io/) programot és az iTunes-t (a Sideloadly oldala leírja, melyik változat kell).
2. Csatlakoztasd az iPhone-t USB-n, és engedélyezd a „Megbízol ebben a számítógépben?” kérdést.
3. Húzd az `.ipa` fájlt a Sideloadly-be, add meg az Apple ID-dat, és nyomj a **Start** gombra.
4. Az iPhone-on kapcsold be: **Beállítások → Adatvédelem és biztonság → Fejlesztői mód** (újraindítás után erősítsd meg).
5. Ingyenes Apple ID-val az alkalmazás 7 napig működik, utána ugyanígy újra kell telepíteni.
