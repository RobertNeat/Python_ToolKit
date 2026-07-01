# Python Venv Toolkit

Proste rozszerzenie VS Code do zarządzania środowiskiem wirtualnym Python w bieżącym folderze roboczym.

## Funkcje

- automatyczne wykrywanie interpretera Python,
- automatyczne tworzenie środowiska `.venv` w katalogu roboczym,
- możliwość usunięcia i ponownego zainicjalizowania `.venv`,
- wykrywanie importów w skryptach `.py` i instalowanie brakujących bibliotek przez `pip`,
- wybór skryptu Python z panelu bocznego,
- uruchamianie wybranego skryptu interpreterem z `.venv`,
- wynik działania skryptu w kanale Output: `Python Venv Toolkit`.

## Wymagania

- VS Code 1.108.1 lub nowszy,
- Python 3.x dostępny w `PATH` albo w standardowej lokalizacji systemowej,
- npm.

## Instalacja zależności projektu

```bash
npm install
```

## Uruchomienie w trybie developerskim

```bash
npm run compile
```

Następnie w VS Code uruchom debugowanie rozszerzenia klawiszem `F5`.

## Użycie

1. Otwórz folder roboczy w VS Code.
2. Otwórz panel `Python Venv` z Activity Bar.
3. Rozszerzenie wykryje Python i utworzy `.venv` w otwartym folderze.
4. Umieść lub wybierz dowolny skrypt `.py` w katalogu roboczym.
5. W panelu wybierz skrypt z listy i kliknij `Uruchom skrypt`.

Skrypty są uruchamiane z katalogiem roboczym ustawionym na otwarty folder VS Code. Jeśli skrypt importuje biblioteki zewnętrzne, użyj przycisku `Zainstaluj zależności z importów`.

## Metadane skryptu

Opcjonalnie można dodać nazwę i opis skryptu w komentarzu lub docstringu:

```python
"""
SCRIPT_NAME: Raport dzienny
SCRIPT_DESCRIPTION: Generuje raport z danych w bieżącym folderze.
"""

import pandas as pd

print("Start")
```

Obsługiwane są też starsze nagłówki `RULE_NAME` i `RULE_DESCRIPTION`.

## Struktura źródeł

```text
src/
├── extension.ts
├── MainViewProvider.ts
├── pythonDetector.ts
├── scriptRunner.ts
├── scriptValidator.ts
└── venvManager.ts
```

## Pakowanie rozszerzenia

```bash
npm install
npm run package
npx @vscode/vsce package --no-dependencies
```

Wynikowy plik będzie miał nazwę w stylu `python-venv-toolkit-0.1.0.vsix`.
