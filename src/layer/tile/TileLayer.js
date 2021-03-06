/*
 * L.TileLayer is used for standard xyz-numbered tile layers.
 */

L.TileLayer = L.GridLayer.extend({

	options: {
		maxZoom: 18,

		subdomains: 'abc',
		errorTileUrl: '',
		zoomOffset: 0,

		maxNativeZoom: null, // Number
		tms: false,
		zoomReverse: false,
		detectRetina: false,
		crossOrigin: false
	},

	initialize: function (url, options) {

		this._url = url;

		options = L.setOptions(this, options);

		// detecting retina displays, adjusting tileSize and zoom levels
		if (options.detectRetina && L.Browser.retina && options.maxZoom > 0) {

			options.tileSize = Math.floor(options.tileSize / 2);
			options.zoomOffset++;

			options.minZoom = Math.max(0, options.minZoom);
			options.maxZoom--;
		}

		if (typeof options.subdomains === 'string') {
			options.subdomains = options.subdomains.split('');
		}

		if (this.options.crs) {
			this._supportCrs();
		}

		// for https://github.com/Leaflet/Leaflet/issues/137
		if (!L.Browser.android) {
			this.on('tileunload', this._onTileRemove);
		}
	},

	setUrl: function (url, noRedraw) {
		this._url = url;

		if (!noRedraw) {
			this.redraw();
		}
		return this;
	},

	createTile: function (coords, done) {
		var tile = document.createElement('img');

		tile.onload = L.bind(this._tileOnLoad, this, done, tile);
		tile.onerror = L.bind(this._tileOnError, this, done, tile);

		if (this.options.crossOrigin) {
			tile.crossOrigin = '';
		}

		/*
		 Alt tag is set to empty string to keep screen readers from reading URL and for compliance reasons
		 http://www.w3.org/TR/WCAG20-TECHS/H67
		*/
		tile.alt = '';

		tile.src = this.getTileUrl(coords);

		return tile;
	},

	getTileUrl: function (coords) {
		return L.Util.template(this._url, L.extend({
			r: this.options.detectRetina && L.Browser.retina && this.options.maxZoom > 0 ? '@2x' : '',
			s: this._getSubdomain(coords),
			x: coords.x,
			y: this.options.tms ? this._globalTileRange.max.y - coords.y : coords.y,
			z: this._getZoomForUrl()
		}, this.options));
	},

	_tileOnLoad: function (done, tile) {
		done(null, tile);
	},

	_tileOnError: function (done, tile, e) {
		var errorUrl = this.options.errorTileUrl;
		if (errorUrl) {
			tile.src = errorUrl;
		}
		done(e, tile);
	},

	_getTileSize: function () {
		var map = this._map,
		    options = this.options,
		    zoom = this._tileZoom + options.zoomOffset,
		    zoomN = options.maxNativeZoom;

		// increase tile size when overscaling
		return zoomN !== null && zoom > zoomN ?
				Math.round(options.tileSize / map.getZoomScale(zoomN, zoom)) :
				options.tileSize;
	},

	_onTileRemove: function (e) {
		e.tile.onload = null;
	},

	_getZoomForUrl: function () {

		var options = this.options,
		    zoom = this._tileZoom;

		if (options.zoomReverse) {
			zoom = options.maxZoom - zoom;
		}

		zoom += options.zoomOffset;

		return options.maxNativeZoom ? Math.min(zoom, options.maxNativeZoom) : zoom;
	},

	_getSubdomain: function (tilePoint) {
		var index = Math.abs(tilePoint.x + tilePoint.y) % this.options.subdomains.length;
		return this.options.subdomains[index];
	},

	// stops loading all tiles in the background layer
	_abortLoading: function () {
		var i, tile;
		for (i in this._tiles) {
			tile = this._tiles[i].el;

			tile.onload = L.Util.falseFn;
			tile.onerror = L.Util.falseFn;

			if (!tile.complete) {
				tile.src = L.Util.emptyImageUrl;
				L.DomUtil.remove(tile);
			}
		}
	},

	_supportCrs: function () {
		var self = this,
			objSync = {},
			fn = self._supportCrs,
			fnOverride = fn.fn_list || ['_reset', '_update'],
			ltNameProps = fn.leftPoint_propNames || ['_initialTopLeftPoint', '_pixelOrigin'],
			override,
			f, fnName,
			overrideBuilder = function () {
				return function contextFn() {

					objSync.running = !!objSync.running;

					var params = objSync.running ? contextFn.caller.arguments : arguments;

					if (!objSync.running) {

						var result,
							m = self._map,
							o = m && m.options,
							z = m && m.getZoom(),
							newCrs = self.options.crs,
							oldCrs = o && o.crs,
							oldLt,
							fnMap = function(a, b, c) {
								for (var i = 0; i < b.length; i++) {
									if (b[i] in a) {
										a[b[i]] = c(b[i], a[b[i]]);
									}
								}
							};

						if (m && !(newCrs === oldCrs)) {
							oldLt  = oldLt || {};
							fnMap(m, ltNameProps, function(key, value) {
								oldLt[key] = value;
								return newCrs.latLngToPoint(oldCrs.pointToLatLng(value, z), z).round();
							});
							o.crs = newCrs;
						}

						objSync.running = true;
						result = contextFn.original.apply(self, params);
						objSync.running = false;

						if (oldLt) {
							fnMap(m, ltNameProps, function(key) {
								return oldLt[key];
							});
							o.crs = oldCrs;
						}

						return result;
					}

					return contextFn.original.apply(self, params);
				};
			};

		for (f in fnOverride) {
			fnName = fnOverride[f];
			if (fnName in self) {
				override = overrideBuilder();
				override.original = self[fnName];
				self[fnName] = override;
			}
		}
	}
});

L.tileLayer = function (url, options) {
	return new L.TileLayer(url, options);
};
