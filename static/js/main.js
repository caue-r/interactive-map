(() => {
    const imageUrl = window.WESTEROS_IMAGE;
    const clearMarkersButton = document.getElementById("clear-markers");
    const clearDrawButton = document.getElementById("clear-draw");
    const themeToggleButton = document.getElementById("theme-toggle");
    const drawColorInput = document.getElementById("draw-color");
    const iconSizeInput = document.getElementById("icon-size");
    const iconSizeValue = document.getElementById("icon-size-value");
    const swatches = document.querySelectorAll(".swatch[data-color]");
    const exportButton = document.getElementById("export-json");
    const importButton = document.getElementById("import-json");
    const importInput = document.getElementById("import-file");
    const externalCanvas = window.paintCanvas;
    const externalSyncCanvas = window.syncCanvas;
    // Escala ajustada: 1 px ≈ 1.5 km
    const WALL_LENGTH_KM = 483;
    const WALL_LENGTH_PX = WALL_LENGTH_KM / 1.5;
    const KM_PER_PIXEL = WALL_LENGTH_KM / WALL_LENGTH_PX;
    // Ajusta a função de distância do CRS simples para refletir a escala (retorna metros)
    L.CRS.Simple.distance = (a, b) => {
        const dx = b.lng - a.lng;
        const dy = b.lat - a.lat;
        const pxDistance = Math.hypot(dx, dy);
        return pxDistance * KM_PER_PIXEL * 1000;
    };
    const kmFromPx = (px) => px * KM_PER_PIXEL;
    const km2FromPx2 = (px2) => px2 * KM_PER_PIXEL * KM_PER_PIXEL;

    const pinOptions = [
        { key: "dragon", label: "Dragão", iconUrl: "static/img/dragon.svg" },
        { key: "mountain", label: "Montanha", iconUrl: "static/img/mountain.svg" },
        { key: "shield", label: "Escudo", iconUrl: "static/img/shield.svg" },
        { key: "swords", label: "Espadas", iconUrl: "static/img/swords.svg" },
        { key: "guerreiro", label: "Guerreiro", iconUrl: "static/img/warrior.svg" },
        { key: "pin", label: "Pin", iconUrl: "static/img/pin.svg" },
        { key: "ship", label: "Navio", iconUrl: "static/img/ship.svg" },
        { key: "wall", label: "Muralha", iconUrl: "static/img/wall.svg" },
    ];
    const baseIconSize = [65, 80];
    const baseIconAnchor = [33, 80];
    const basePopupAnchor = [0, -70];
    const defaultIconKey = "pin";
    let markerIcons = {};

    const scalePair = (pair, scale) => pair.map((value) => Math.round(value * scale));
    const buildMarkerIcons = (scale) =>
        pinOptions.reduce((acc, opt) => {
            acc[opt.key] = L.icon({
                iconUrl: opt.iconUrl,
                iconSize: scalePair(baseIconSize, scale),
                iconAnchor: scalePair(baseIconAnchor, scale),
                popupAnchor: scalePair(basePopupAnchor, scale),
                className: `westeros-${opt.key}`,
            });
            return acc;
        }, {});

    const applyIconScale = (scale) => {
        markerIcons = buildMarkerIcons(scale);
        L.Icon.Default.mergeOptions({
            iconUrl: "static/img/pin.svg",
            iconRetinaUrl: "static/img/pin.svg",
            shadowUrl: null,
            iconSize: scalePair(baseIconSize, scale),
            iconAnchor: scalePair(baseIconAnchor, scale),
            popupAnchor: scalePair(basePopupAnchor, scale),
        });
        markers.forEach((entry) => {
            entry.marker.setIcon(markerIcons[entry.iconKey] || markerIcons[defaultIconKey]);
        });
    };

    const markers = [];
    let drawnItems = null;
    let drawControl = null;
    let markerCounter = 1;
    let mapInstance = null;
    let contextMenu = null;

    applyIconScale(1);

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

    function addMarkerAt(latlng, iconKey, options = {}) {
        const entry = {
            id: options.id ?? markerCounter++,
            name: options.name ?? `Marcador ${markerCounter - 1}`,
            description: options.description ?? "",
            latlng,
            iconKey: iconKey || options.iconKey || defaultIconKey,
        };

        const marker = L.marker(latlng, {
            icon: markerIcons[entry.iconKey] || markerIcons[defaultIconKey],
            draggable: true,
        }).addTo(mapInstance);
        entry.marker = marker;
        marker.bindPopup(buildPopupContent(entry), { autoPan: true });
        marker.on("popupopen", (evt) => attachPopupHandlers(evt.popup, entry));
        marker.on("dragend", () => {
            entry.latlng = marker.getLatLng();
            marker.setPopupContent(buildPopupContent(entry));
        });

        if (options.openPopup !== false) {
            marker.openPopup();
        }

        markers.push(entry);
        return entry;
    }

    function setupContextMenu(map) {
        const container = map.getContainer();
        const menu = document.createElement("div");
        menu.className = "map-context-menu hidden";
        menu.setAttribute("role", "menu");

        pinOptions.forEach((option) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "menu-item";
            button.dataset.icon = option.key;
            button.setAttribute("role", "menuitem");
            button.innerHTML = `
                <img src="${option.iconUrl}" alt="" aria-hidden="true" />
                <span>${option.label}</span>
            `;
            menu.appendChild(button);
        });

        container.appendChild(menu);
        let targetLatLng = null;

        const closeMenu = () => {
            targetLatLng = null;
            menu.classList.add("hidden");
        };

        const openMenu = (latlng, point) => {
            targetLatLng = latlng;
            menu.classList.remove("hidden");
            menu.style.left = "0px";
            menu.style.top = "0px";

            const { clientWidth, clientHeight } = container;
            const menuWidth = menu.offsetWidth || 0;
            const menuHeight = menu.offsetHeight || 0;
            const left = Math.min(Math.max(point.x, 8), clientWidth - menuWidth - 8);
            const top = Math.min(Math.max(point.y, 8), clientHeight - menuHeight - 8);
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        };

        menu.addEventListener("click", (evt) => {
            const btn = evt.target.closest("button[data-icon]");
            if (!btn || !targetLatLng) return;

            addMarkerAt(targetLatLng, btn.dataset.icon);
            closeMenu();
        });

        document.addEventListener("keydown", (evt) => {
            if (evt.key === "Escape") {
                closeMenu();
            }
        });

        map.on("click zoomstart movestart", closeMenu);
        return { open: openMenu, close: closeMenu };
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
        contextMenu = setupContextMenu(map);
        addScaleControl(map, { width, height, kmPerPixel: KM_PER_PIXEL });

        map.on("contextmenu", (event) => {
            event.originalEvent?.preventDefault();
            contextMenu?.open(event.latlng, event.containerPoint ?? map.latLngToContainerPoint(event.latlng));
        });

        clearMarkersButton?.addEventListener("click", clearMarkers);
        clearDrawButton?.addEventListener("click", clearDrawings);
        themeToggleButton?.addEventListener("click", () => {
            document.body.classList.toggle("light-mode");
            themeToggleButton.textContent = document.body.classList.contains("light-mode") 
                ? "Modo Escuro" 
                : "Modo Claro";
        });

        if (iconSizeInput) {
            const updateIconScale = () => {
                const scale = Number.parseFloat(iconSizeInput.value) || 1;
                if (iconSizeValue) {
                    iconSizeValue.textContent = `${scale.toFixed(1)}x`;
                }
                applyIconScale(scale);
            };
            iconSizeInput.addEventListener("input", updateIconScale);
            updateIconScale();
        }
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
            attachMeasurement(event.layer);
        });

        mapInstance?.off(L.Draw.Event.EDITED);
        mapInstance?.on(L.Draw.Event.EDITED, (event) => {
            event.layers?.eachLayer((layer) => attachMeasurement(layer));
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

    function addScaleControl(map, { width, height, kmPerPixel }) {
        const targetKmOptions = [25, 50, 100, 200, 400];
        const control = L.control({ position: "bottomleft" });
        let barEl = null;
        let labelEl = null;

        const mapUnitsForKm = (km) => km / kmPerPixel;
        const computeScreenWidth = (km) => {
            const origin = map.latLngToLayerPoint([height - 80, 80]);
            const dest = map.latLngToLayerPoint([height - 80, 80 + mapUnitsForKm(km)]);
            return Math.abs(dest.x - origin.x);
        };

        const updateScale = () => {
            let chosenKm = targetKmOptions[targetKmOptions.length - 1];
            for (const km of targetKmOptions) {
                const widthPx = computeScreenWidth(km);
                if (widthPx >= 70 && widthPx <= 160) {
                    chosenKm = km;
                    break;
                }
            }

            const widthPx = computeScreenWidth(chosenKm);
            if (barEl) {
                barEl.style.width = `${Math.round(widthPx)}px`;
            }
            if (labelEl) {
                labelEl.textContent = `${chosenKm} km (1 px ≈ ${kmPerPixel.toFixed(2)} km)`;
            }
        };

        control.onAdd = () => {
            const container = L.DomUtil.create("div", "map-scale");
            barEl = L.DomUtil.create("div", "map-scale__bar", container);
            labelEl = L.DomUtil.create("div", "map-scale__label", container);
            labelEl.textContent = "Escala";
            return container;
        };

        control.addTo(map);
        map.on("zoomend", updateScale);
        map.whenReady(updateScale);
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
                iconKey: m.iconKey || defaultIconKey,
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

    function attachMeasurement(layer) {
        if (!layer || !mapInstance) return;

        const removeExisting = () => {
            if (layer._measureTooltip) {
                layer.unbindTooltip(layer._measureTooltip);
                layer._measureTooltip = null;
            }
        };

        const text = buildMeasurementText(layer);
        removeExisting();
        if (!text) return;

        layer._measureTooltip = layer
            .bindTooltip(text, {
                permanent: false,
                direction: "center",
                className: "measure-label",
                opacity: 0.9,
                sticky: true,
            });
    }

    function buildMeasurementText(layer) {
        if (layer instanceof L.Circle) {
            const radiusKm = kmFromPx(layer.getRadius());
            const areaKm2 = Math.PI * radiusKm * radiusKm;
            return `Raio: ${radiusKm.toFixed(1)} km · Área: ${areaKm2.toFixed(1)} km²`;
        }

        if (layer instanceof L.Rectangle || layer instanceof L.Polygon) {
            const latlngs = normalizeLatLngs(layer.getLatLngs());
            if (!latlngs.length) return null;
            const perimeter = polylineLengthKm(latlngs, true);
            const area = polygonAreaKm2(latlngs);
            return `Perímetro: ${perimeter.toFixed(1)} km · Área: ${area.toFixed(1)} km²`;
        }

        if (layer instanceof L.Polyline) {
            const latlngs = normalizeLatLngs(layer.getLatLngs());
            if (!latlngs.length) return null;
            const lengthKm = polylineLengthKm(latlngs);
            return `Comprimento: ${lengthKm.toFixed(1)} km`;
        }

        return null;
    }

    function normalizeLatLngs(latlngs) {
        if (!Array.isArray(latlngs)) return [];
        const flat = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
        if (!flat.length) return [];
        const first = flat[0];
        const last = flat[flat.length - 1];
        if (first.lat === last.lat && first.lng === last.lng && flat.length > 1) {
            return flat.slice(0, -1);
        }
        return flat;
    }

    function polylineLengthKm(latlngs, closeLoop = false) {
        if (!Array.isArray(latlngs) || latlngs.length < 2) return 0;
        let total = 0;
        const points = closeLoop ? [...latlngs, latlngs[0]] : latlngs;
        for (let i = 1; i < points.length; i += 1) {
            const a = points[i - 1];
            const b = points[i];
            const dx = b.lng - a.lng;
            const dy = b.lat - a.lat;
            total += Math.hypot(dx, dy);
        }
        return kmFromPx(total);
    }

    function polygonAreaKm2(latlngs) {
        if (!Array.isArray(latlngs) || latlngs.length < 3) return 0;
        let areaPx2 = 0;
        for (let i = 0; i < latlngs.length; i += 1) {
            const j = (i + 1) % latlngs.length;
            areaPx2 += latlngs[i].lng * latlngs[j].lat - latlngs[j].lng * latlngs[i].lat;
        }
        const area = Math.abs(areaPx2) * 0.5;
        return km2FromPx2(area);
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
        addMarkerAt(L.latLng(m.lat, m.lng), m.iconKey || defaultIconKey, {
            id: m.id,
            name: m.name,
            description: m.description,
            openPopup: false,
        });
    }

    function addImportedDrawings(features) {
        if (!drawnItems) return;
        const geoJson = L.geoJSON(features, {
            style: (feature) => feature?.properties?.style || shapeOptions(),
        });
        geoJson.eachLayer((layer) => {
            drawnItems.addLayer(layer);
            attachMeasurement(layer);
        });
    }

    function toggleCanvasVisibility(show) {
        if (!externalCanvas) return;
        externalCanvas.style.display = show ? "block" : "none";
    }

    function bootstrap() {
        const probe = new Image();
        probe.src = imageUrl;

        probe.onload = () => {
            initMap({ width: probe.naturalWidth, height: probe.naturalHeight });
            // revalida tamanho da camada de pintura após o mapa definir o layout
            if (typeof externalSyncCanvas === "function") {
                setTimeout(externalSyncCanvas, 100);
            }
        };

        probe.onerror = () => {
            const mapContainer = document.getElementById("map");
            mapContainer.innerHTML = "<p style='padding:12px'>Não foi possível carregar a imagem do mapa. Verifique se o arquivo static/img/Westeros.png existe.</p>";
        };
    }

    bootstrap();
})();
