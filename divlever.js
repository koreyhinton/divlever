const divlever = {};
divlever.static = {};
divlever.dyn = {};
divlever.embed = {};
divlever.udfs = {};
divlever.builtin = {};

// RENDERING SYSTEM

divlever.autoScan = async function({ nodeMode = false } = {}) {
    if (nodeMode || typeof document === 'undefined') {
        console.warn('autoscan: Running in nodeMode, skipping DOM scan.');
        return;
    }

    const divs = document.getElementsByTagName('div');
    for (let div of divs) {
        const id = div.getAttribute('id');
        if (!id) continue;

        // Static component: dl-ComponentName-n
        const staticMatch = id.match(/^dl-([A-Za-z0-9_]+)-(\d+)$/);
        if (staticMatch) {
            const [, name, n] = staticMatch;
            if (divlever.udfs && typeof divlever.udfs[name] === 'function') {
                divlever.udfs[name](null, { id }, n);
            } else {
                console.warn(`autoScan: No udfs handler for component "${name}"`);
            }
            continue;
        }

        // Dynamic include: dli-ComponentName-n with src
        const dynamicMatch = id.match(/^dli-([A-Za-z0-9_]+)-(\d+)$/);
        const src = div.getAttribute('src');
        if (dynamicMatch && src) {
            const [, name, n] = dynamicMatch;
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const html = await res.text();
                div.innerHTML = html;
                requestAnimationFrame(() => {
                    divlever.autoScanRegion(div);
                });
                if (divlever.udfs && typeof divlever.udfs[name] === 'function') {
                    divlever.udfs[name](null, { id }, n);
                }
            } catch(err) {
                console.error(`autoScan: Failed to load "${src}" for "${id}":`, err);
                div.innerHTML = `<div class="error">Failed to load content</div>`;
            }
        }
    }
};

divlever.autoScanRegion = function(rootElement) {
    const divs = rootElement.getElementsByTagName('div');
    for (let div of divs) {
        const id = div.getAttribute('id');
        if (!id) continue;

        const staticMatch = id.match(/^dl-([A-Za-z0-9_]+)-(\d+)$/);
        if (staticMatch) {
            const [, name, n] = staticMatch;
            if (divlever.udfs && typeof divlever.udfs[name] === 'function') {
                divlever.udfs[name](null, { id }, n);
            }
        }
    }
};

// DATA APIS

divlever.data = (function() {

    const store = {};

    function get(key, payload) {
        const id = payload?.id;
        if (!id) return undefined;
        return store[id]?.[key];
    }

    function set(key, value, payload) {
        const id = payload?.id;
        if (!id) return;
        if (!store[id]) {
            store[id] = {};
        }
        store[id][key] = value;
    }

    return { get, set, debug: function() { console.log(store); } };

}());

divlever.collect = function(componentId) {
    return Object.assign(
        {},
        divlever.collectData(componentId),
        divlever.collectValues(componentId)
    );
};

divlever.collectData = function(componentId) {
    const collected = {};
    const element = document.getElementById(componentId);
    if (!element) return collected;

    const dataValue = divlever.data.get('divleverCollect', { id: componentId });
    if (dataValue !== undefined) {
        collected[componentId] = dataValue;
    }

    const children = element.querySelectorAll('div[id]');
    children.forEach(child => {
        const childId = child.id;
        const childValue = divlever.data.get('divleverCollect', { id: childId });
        if (childValue !== undefined) {
            collected[childId] = childValue;
        }
    });

    return collected;
};

divlever.collectValues = function(componentId) {
    const collected = {};
    const element = document.getElementById(componentId);
    if (!element) return collected;

    const inputs = element.querySelectorAll('input[id], select[id], textarea[id]');
    inputs.forEach(input => {
        const key = input.id;
        collected[key] = input.value;
    });

    return collected; // ← REMOVE the [componentId] nesting
};

// COMPONENT APIS

divlever.reloadComponent = function(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`reloadComponent: No element found with id "${id}"`);
        return;
    }

    const staticMatch = id.match(/^dl-([A-Za-z0-9_]+)-(\d+)$/);
    if (staticMatch) {
        const [, name, n] = staticMatch;
        if (divlever.udfs && typeof divlever.udfs[name] === 'function') {
            divlever.udfs[name](null, { id }, n);
        }
        return;
    }

    const dynamicMatch = id.match(/^dli-([A-Za-z0-9_]+)-(\d+)$/);
    if (dynamicMatch) {
        divlever.autoScanRegion(element);
        return;
    }

    console.warn(`reloadComponent: Unknown id format "${id}"`);
};

divlever.render = function(html, payload) {
    if (!payload || !payload.id) {
        console.warn('divlever.render called without payload.id');
        return;
    }

    var element = document.getElementById(payload.id);
    if (!element) {
        console.warn('divlever.render could not find element with id:', payload.id);
        return;
    }

    if (!/^dli-/.test(payload.id)) {
        element.innerHTML = html;
    }

    requestAnimationFrame(() => {
        divlever.autoScanRegion(element);
    });
};

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        divlever.autoScan();
    });
}

// BUILTINS

divlever.udfs.modalComponent = function(cmd, payload, n) {
    const el = document.getElementById(payload.id);
    if (!el) return;
    var oldSrc = divlever.get("src", payload);
    var src = null;
    var html = null;
    var hasHtmlUpdate = true;

    if (cmd == "test") {
        var inputsTest = !!payload.id && (!!n && n>0) && (!!payload.html || !!payload.src);
        var outputsTest = ((payload?.html ?? "") + (payload?.src ?? "")).length > 0;
        console.log(`modalComponent-${n} test`, inputsTest && outputsTest);
        return;
    }    

    if (!payload.html && !payload.src) {
        hasHtmlUpdate = false;
        html = divlever.get("html", payload);
        src = oldSrc;
        if (!html && !src) {
            src = el.getAttribute("src");
            if (!src && cmd != null) {
                console.warn("src or html must be provided to initialize a modalComponent");
                requestAnimationFrame(() => {  // if app code called this, then it must auto-scan
                    divlever.autoScanRegion(el);
                });
                return;
            }
        }
    }
    if (cmd === "show") {
        el.style.display = "block";
    } else if (cmd === "hide" || cmd == null) {
        el.style.display = "none";// modals require explicit 'show' to overlay the screen
    }

    if ((cmd == null || cmd == "fill" || cmd == "show" || cmd == "hide") && !!html) {
        if (hasHtmlUpdate) divlever.set("html", html, payload);
        el.innerHTML = html;
        requestAnimationFrame(() => {
            divlever.autoScanRegion(el);
        });
    } else if ((cmd == null || cmd == "fill" || (cmd == "show" && oldSrc!=src)) && !!src) {
        // only fetch html page if it's the first load or specified to "fill"
        if (hasHtmlUpdate) divlever.set("src", src, payload);
        fetch(src)
            .then(res => res.text())
            .then(html => {
                el.innerHTML = html;
                requestAnimationFrame(() => {
                    divlever.autoScanRegion(el);
                });
            });
    } else {
        requestAnimationFrame(() => { // if app code called this, then it must auto-scan
            divlever.autoScanRegion(el);
        });
    }
    return;
};
