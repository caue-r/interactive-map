(() => {
    const imageUrl = window.WESTEROS_IMAGE;
    const clearMarkersButton = document.getElementById("clear-markers");
    const clearDrawButton = document.getElementById("clear-draw");
    const drawColorInput = document.getElementById("draw-color");
    const swatches = document.querySelectorAll(".swatch[data-color]");
    const exportButton = document.getElementById("export-json");
    const importButton = document.getElementById("import-json");
    const importInput = document.getElementById("import-file");
    const markerIcon = L.icon({
        iconUrl: "static/img/pin.svg",
        iconSize: [26, 32],
        iconAnchor: [13, 32],
        popupAnchor: [0, -28],
        className: "westeros-pin",
    });
    L.Icon.Default.mergeOptions({
        iconUrl: "static/img/pin.svg",
        iconRetinaUrl: "static/img/pin.svg",
        shadowUrl: null,
        iconSize: [26, 32],
        iconAnchor: [13, 32],
        popupAnchor: [0, -28],
    });
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
                    <button type="button" data-action="save">Salvar</button>
                    <button type="button" data-action="delete">Excluir</button>
                </div>
            </form>
        `;
    }

    function attachPopupHandlers(popup, entry) {
        const form = popup._contentNode?.querySelector("form.marker-form");
        if (!form) return;

        form.addEventListener("submit", (event) => event.preventDefault());
        const deleteButton = form.querySelector('button[data-action="delete"]');
        const saveButton = form.querySelector('button[data-action="save"]');

        saveButton?.addEventListener("click", (event) => {
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

            const marker = L.marker(event.latlng, { icon: markerIcon }).addTo(map);
            entry.marker = marker;
            marker.bindPopup(buildPopupContent(entry), { autoPan: true }).openPopup();

            // Garante handlers já no primeiro abrir e em reaberturas
            const initialPopup = marker.getPopup();
            if (initialPopup) {
                attachPopupHandlers(initialPopup, entry);
            }
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
        exportButton?.addEventListener("click", exportJson);
        importButton?.addEventListener("click", () => importInput?.click());
        importInput?.addEventListener("change", handleImportFile);
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

    function exportJson() {
        const data = {
            baseImage: imageUrl,
            generatedAt: new Date().toISOString(),
            markers: markers.map((m) => ({
                id: m.id,
                name: m.name,
                description: m.description,
                lat: m.latlng.lat,
                lng: m.latlng.lng,
            })),
            drawings: exportDrawings(),
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mapa-westeros.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportDrawings() {
        if (!drawnItems) return [];
        const features = [];
        drawnItems.eachLayer((layer) => {
            if (!layer.toGeoJSON) return;
            const geo = layer.toGeoJSON();
            geo.properties = geo.properties || {};
            geo.properties.style = extractStyle(layer.options || {});
            features.push(geo);
        });
        return features;
    }

    function extractStyle(options) {
        return {
            color: options.color || drawColorInput?.value || "#f59e0b",
            weight: options.weight ?? 3,
            opacity: options.opacity ?? 0.9,
            fillColor: options.fillColor || options.color || drawColorInput?.value || "#f59e0b",
            fillOpacity: options.fillOpacity ?? 0.3,
        };
    }

    function handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = JSON.parse(reader.result);
                applyImport(json);
            } catch (err) {
                alert("Não foi possível ler o JSON. Verifique o arquivo.");
            } finally {
                importInput.value = "";
            }
        };
        reader.readAsText(file);
    }

    function applyImport(data) {
        if (!data) return;
        clearDrawings();
        clearMarkers();

        if (Array.isArray(data.markers)) {
            data.markers.forEach((m) => addImportedMarker(m));
        }

        if (Array.isArray(data.drawings)) {
            addImportedDrawings(data.drawings);
        }

        const maxId = markers.reduce((max, m) => Math.max(max, m.id || 0), 0);
        markerCounter = maxId + 1;
    }

    function addImportedMarker(m) {
        if (!m || typeof m.lat !== "number" || typeof m.lng !== "number") return;
        const entry = {
            id: m.id ?? markerCounter++,
            name: m.name || `Marcador ${markerCounter}`,
            description: m.description || "",
            latlng: L.latLng(m.lat, m.lng),
        };

        const marker = L.marker(entry.latlng, { icon: markerIcon }).addTo(mapInstance);
        entry.marker = marker;
        marker.bindPopup(buildPopupContent(entry), { autoPan: true });
        marker.on("popupopen", (evt) => attachPopupHandlers(evt.popup, entry));
        markers.push(entry);
    }

    function addImportedDrawings(features) {
        if (!drawnItems) return;
        const geoJson = L.geoJSON(features, {
            style: (feature) => feature?.properties?.style || shapeOptions(),
        });
        geoJson.eachLayer((layer) => drawnItems.addLayer(layer));
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
