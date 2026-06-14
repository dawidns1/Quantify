import os
import requests
import json

def generate_insights(portfolio_state: dict, lang: str = "en") -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        if lang == "pl":
            return (
                "**Błąd konfiguracji**: Klucz API Gemini nie został ustawiony na serwerze backendu. "
                "Aby włączyć doradcę AI, dodaj zmienną środowiskową `GEMINI_API_KEY` w panelu Supabase / Render."
            )
        else:
            return (
                "**Configuration Error**: Gemini API key is not configured on the backend server. "
                "To enable the AI Copilot, please set the `GEMINI_API_KEY` environment variable on your hosting provider."
            )
            
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    
    # Formulate prompts
    if lang == "pl":
        system_instruction = (
            "Jesteś profesjonalnym, licencjonowanym doradcą inwestycyjnym i analitykiem ryzyka portfelowego. "
            "Twoim zadaniem jest analiza stanu portfela użytkownika na podstawie dostarczonych danych liczbowych. "
            "Przeanalizuj dywersyfikację, wskaźnik Sharpe'a, współczynnik Beta, podział walutowy, korelacje oraz nadchodzące dywidendy. "
            "Odpowiedz w języku polskim, używając profesjonalnego i konstruktywnego tonu. Używaj formatowania Markdown (pogrubienia, punkty, sekcje). "
            "Zachowaj zwięzłość: napisz krótkie, konkretne i wartościowe wskazówki. Nie pisz wstępów ani podsumowań typu 'Oto moja analiza...', zacznij od razu od pierwszej sekcji."
        )
        prompt_content = f"""
Przeanalizuj poniższe dane portfela inwestycyjnego i przygotuj raport:

Dane portfela:
- Waluta bazowa portfela: {portfolio_state.get('base_currency', 'USD')}
- Liczba walorów: {portfolio_state.get('total_holdings_count', 0)}
- Wagi poszczególnych spółek: {json.dumps(portfolio_state.get('weights_by_symbol', {}))}
- Podział walutowy aktywów: {json.dumps(portfolio_state.get('allocation_by_currency', {}))}
- Współczynnik zmienności portfela (Beta): {portfolio_state.get('portfolio_beta', 1.0)}
- Wskaźnik Sharpe'a portfela (Sharpe Ratio): {portfolio_state.get('sharpe_ratio', 0.0)}
- Średnia korelacja między aktywami: {portfolio_state.get('average_holding_correlation', 0.0)}
- Nadchodzące ex-dividend (odcięcie prawa do dywidendy): {json.dumps(portfolio_state.get('upcoming_ex_dividend_events', []))}

Podziel swój raport na trzy wyraźne sekcje za pomocą nagłówków H3 (###):
### 📊 Analiza Dywersyfikacji i Alokacji
(Zrecenzuj wagi spółek, liczbę aktywów oraz ekspozycję walutową. Wskaż, czy portfel nie jest zbyt skoncentrowany).

### ⚡ Profil Ryzyka i Korelacje
(Zinterpretuj wskaźnik Sharpe'a oraz współczynnik Beta. Oceń średnią korelację aktywów i wskaż, czy są one dobrze zbalansowane pod kątem ryzyka).

### 🔔 Wskazówki i Nadchodzące Wydarzenia
(Ostrzeż o ryzykach związanych z nadchodzącymi odcięciami dywidend, zmianami kursów walutowych lub wysoką koncentracją i podaj konkretne porady co do rebalansowania).
"""
    else:
        system_instruction = (
            "You are a professional, licensed investment advisor and portfolio risk analyst. "
            "Your task is to analyze the user's portfolio state based on the provided metrics. "
            "Evaluate diversification, Sharpe ratio, Beta, currency allocations, asset correlation, and upcoming dividends. "
            "Respond in English using a professional, constructive, and objective tone. Use clean Markdown formatting. "
            "Be concise and direct: write actionable insights rather than general filler. Do not include introductory or concluding remarks (e.g. 'Here is my analysis...'), start directly with the first section."
        )
        prompt_content = f"""
Please analyze the following investment portfolio data and write a structured analysis report:

Portfolio State:
- Base Currency: {portfolio_state.get('base_currency', 'USD')}
- Total Holdings Count: {portfolio_state.get('total_holdings_count', 0)}
- Weights by Symbol: {json.dumps(portfolio_state.get('weights_by_symbol', {}))}
- Asset Currency Exposure: {json.dumps(portfolio_state.get('allocation_by_currency', {}))}
- Portfolio Volatility factor (Beta): {portfolio_state.get('portfolio_beta', 1.0)}
- Portfolio Sharpe Ratio: {portfolio_state.get('sharpe_ratio', 0.0)}
- Average asset correlation coefficient: {portfolio_state.get('average_holding_correlation', 0.0)}
- Upcoming ex-dividend events: {json.dumps(portfolio_state.get('upcoming_ex_dividend_events', []))}

Structure your report into three distinct sections using H3 (###) headers:
### 📊 Diversification & Allocation Analysis
(Review symbol weights, asset counts, and currency exposure. Flag if the portfolio is too concentrated).

### ⚡ Risk Profile & Correlation Insights
(Interpret Sharpe ratio and Beta. Evaluate the average correlation coefficient and check if they are well hedged).

### 🔔 Actionable Alerts & Warnings
(Warn about risks related to upcoming ex-dividend dates, fx exposure changes, or concentration, and give exact, concrete rebalancing advice).
"""

    # Prepare body
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt_content
                    }
                ]
            }
        ],
        "systemInstruction": {
            "parts": [
                {
                    "text": system_instruction
                }
            ]
        },
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1200
        }
    }
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=12.0)
        if response.status_code != 200:
            print(f"[AI CLIENT] Gemini API returned error {response.status_code}: {response.text}")
            if lang == "pl":
                return f"**Błąd komunikacji z AI**: Serwer Google zwrócił status {response.status_code}."
            else:
                return f"**AI Communication Error**: Google server returned status {response.status_code}."
                
        res_json = response.json()
        candidates = res_json.get("candidates", [])
        if not candidates:
            if lang == "pl":
                return "**Błąd AI**: Serwer nie wygenerował żadnych sugestii."
            else:
                return "**AI Error**: The model did not generate any suggestions."
                
        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return text.strip()
        
    except requests.exceptions.Timeout:
        if lang == "pl":
            return "**Błąd przekroczenia limitu czasu**: Zapytanie do Gemini API trwało zbyt długo. Spróbuj ponownie za chwilę."
        else:
            return "**Timeout Error**: The request to Gemini API timed out. Please try again shortly."
    except Exception as e:
        print(f"[AI CLIENT] Unexpected error: {e}")
        if lang == "pl":
            return f"**Nieoczekiwany błąd**: {str(e)}"
        else:
            return f"**Unexpected Error**: {str(e)}"
