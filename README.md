# Mapa Interativo (estático)

Protótipo estático de um mapa customizado usando Leaflet e Leaflet.draw com seleção de mapa base (Westeros ou Costa da Espada).

## Como rodar

- Opção 1: abra `index.html` diretamente no navegador (funciona sem servidor).
- Opção 2: sirva como site estático (`npx serve .` ou extensão Live Server).

- Escolha o mapa base no seletor "Mapa base" (Westeros ou Costa da Espada).
- Troque as imagens base substituindo `static/img/Westeros.png` ou `static/img/SwordCoast.svg`.

## Funcionalidades

- Marcadores (botão direito) com popup para nome e descrição.
- Barra de desenho (Leaflet.draw) para linhas, polígonos, retângulos e círculos, com edição/remoção.
- Botões para limpar marcadores e desenhos.

## Estrutura

- `index.html`: página principal.
- `static/js/main.js`: lógica do mapa, pins e desenho.
- `static/css/styles.css`: tema e layout.
- `static/js/leaflet.js` e `static/css/leaflet.css`: Leaflet local.
- `static/js/leaflet.draw.js` e `static/css/leaflet.draw.css`: Leaflet.draw local.
- `static/img/Westeros.png`: imagem do mapa de Westeros.
- `static/img/SwordCoast.svg`: imagem do mapa da Costa da Espada.
- `static/img/pin.svg`: ícone usado nos marcadores.
