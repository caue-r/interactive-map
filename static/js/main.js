(() => {
    const imageUrl = window.WESTEROS_IMAGE;
    const clearMarkersButton = document.getElementById("clear-markers");
    const clearDrawButton = document.getElementById("clear-draw");
    const drawColorInput = document.getElementById("draw-color");
    const swatches = document.querySelectorAll(".swatch[data-color]");
    const markers = [];
    let drawnItems = null;
    let drawControl = null;
    let markerCounter = 1;
    let mapInstance = null;

    function buildPopupContent(entry) {
        const { id, name, description, latlng } = entry;
        const coords = `${latlng.lat.toFixed(1)}, ${latlng.lng.toFixed(1)}`;

        return `
            <form class="marker-form" data-id="${id}">
                <label>
                    Nome
                    <input name="name" value="${name ?? ""}" autocomplete="off" />
                </label>
                <label>
                    Descrição (opcional)
                    <textarea name="description" rows="2" placeholder="Notas do marcador">${description ?? ""}</textarea>
                </label>
                <p class="coords">Coordenadas: ${coords}</p>
                <div class="form-actions">
                    <button type="submit">Salvar</button>
                    <button type="button" data-action="delete">Excluir</button>
                </div>
            </form>
        `;
    }

    function attachPopupHandlers(popup, entry) {
        const form = popup._contentNode?.querySelector("form.marker-form");
        if (!form) return;

        const deleteButton = form.querySelector('button[data-action="delete"]');

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            entry.name = (formData.get("name") || "").trim() || entry.name;
            entry.description = (formData.get("description") || "").trim();

            // Re-render popup with cleaned values
            entry.marker.setPopupContent(buildPopupContent(entry));
            entry.marker.openPopup();
        });

        deleteButton?.addEventListener("click", () => {
            entry.marker.remove();
            const idx = markers.findIndex((m) => m.id === entry.id);
            if (idx >= 0) {
                markers.splice(idx, 1);
            }
        });
    }

    function clearMarkers() {
        while (markers.length) {
            const entry = markers.pop();
            entry.marker.remove();
        }
    }

    function initMap({ width, height }) {
        const bounds = [
            [0, 0],
            [height, width],
        ];

        const map = L.map("map", {
            crs: L.CRS.Simple,
            minZoom: -1.5,
            maxZoom: 3,
            zoomSnap: 0.25,
        });
        mapInstance = map;

        L.imageOverlay(imageUrl, bounds, { zIndex: 1 }).addTo(map);
        map.fitBounds(bounds);

        drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        addDrawControl();

        map.on("contextmenu", (event) => {
            event.originalEvent?.preventDefault();
            const entry = {
                id: markerCounter++,
                name: `Marcador ${markerCounter - 1}`,
                description: "",
                latlng: event.latlng,
            };

            const marker = L.marker(event.latlng).addTo(map);
            entry.marker = marker;
            marker.bindPopup(buildPopupContent(entry), { autoPan: true }).openPopup();

            marker.on("popupopen", (evt) => attachPopupHandlers(evt.popup, entry));
            markers.push(entry);
        });

        clearMarkersButton?.addEventListener("click", clearMarkers);
        clearDrawButton?.addEventListener("click", clearDrawings);
        drawColorInput?.addEventListener("change", resetDrawControl);
        swatches.forEach((swatch) => {
            swatch.addEventListener("click", () => selectSwatchColor(swatch.dataset.color));
            swatch.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectSwatchColor(swatch.dataset.color);
                }
            });
        });
    }

    function clearDrawings() {
        drawnItems?.clearLayers();
    }

    function shapeOptions() {
        const color = drawColorInput?.value || "#f59e0b";
        return {
            color,
            weight: 3,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: 0.3,
        };
    }

    function addDrawControl() {
        if (drawControl) {
            mapInstance?.removeControl(drawControl);
        }

        drawControl = new L.Control.Draw({
            position: "topleft",
            draw: {
                polygon: { allowIntersection: false, showArea: true, shapeOptions: shapeOptions() },
                polyline: { shapeOptions: shapeOptions() },
                rectangle: { shapeOptions: shapeOptions() },
                circle: { shapeOptions: shapeOptions() },
                circlemarker: false,
                marker: false,
            },
            edit: {
                featureGroup: drawnItems,
                remove: true,
            },
        });

        mapInstance?.addControl(drawControl);

        mapInstance?.off(L.Draw.Event.CREATED);
        mapInstance?.on(L.Draw.Event.CREATED, (event) => {
            // Se o layer não tiver estilos aplicados (ex: circlemarker), aplica cor
            if (event.layer && event.layer.setStyle && !event.layer.options.color) {
                event.layer.setStyle(shapeOptions());
            }
            drawnItems.addLayer(event.layer);
        });
    }

    function resetDrawControl() {
        addDrawControl();
    }

    function selectSwatchColor(color) {
        if (!color || !drawColorInput) return;
        drawColorInput.value = color;
        drawColorInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function toggleCanvasVisibility(show) {
        if (!paintCanvas) return;
        paintCanvas.style.display = show ? "block" : "none";
    }

    function bootstrap() {
        const probe = new Image();
        probe.src = imageUrl;

        probe.onload = () => {
            initMap({ width: probe.naturalWidth, height: probe.naturalHeight });
            // revalida tamanho da camada de pintura após o mapa definir o layout
            setTimeout(syncCanvas, 100);
        };

        probe.onerror = () => {
            const mapContainer = document.getElementById("map");
            mapContainer.innerHTML = "<p style='padding:12px'>Não foi possível carregar a imagem do mapa. Verifique se o arquivo static/img/Westeros.png existe.</p>";
        };
    }

    bootstrap();
})();
