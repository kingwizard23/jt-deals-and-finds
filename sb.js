// Tiny Supabase client (REST + auth + storage). No library needed.
(function(){
  const C = window.SNAP_CONFIG || {};
  const url = String(C.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(C.SUPABASE_KEY || "");
  const configured = /^https:\/\//.test(url) && key && !/PASTE_/.test(url + key);
  const SKEY = "sts-sb-session";
  const enc = p => String(p).split("/").map(encodeURIComponent).join("/");

  function load(){ try{ return JSON.parse(localStorage.getItem(SKEY) || "null"); }catch(e){ return null; } }
  function persist(s){ try{ s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); }catch(e){} }

  const SB = {
    configured, url,
    session: load(),

    headers(extra, anon){
      const h = Object.assign({ apikey: key }, extra || {});
      if(!anon && this.session) h.Authorization = "Bearer " + this.session.access_token;
      return h;
    },

    _save(d){
      this.session = {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: d.expires_at || (Math.floor(Date.now()/1000) + (d.expires_in || 3600)),
        email: (d.user && d.user.email) || (this.session && this.session.email) || ""
      };
      persist(this.session);
    },

    async signIn(email, password){
      const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: key, "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(d.error_description || d.msg || d.message || "Sign-in failed");
      this._save(d);
    },

    async refresh(){
      if(!this.session) return false;
      try{
        const r = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST", headers: { apikey: key, "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: this.session.refresh_token })
        });
        if(!r.ok){ if(r.status === 400 || r.status === 401) this.signOut(); return false; }
        this._save(await r.json()); return true;
      }catch(e){ return false; }
    },

    signOut(){ this.session = null; persist(null); },

    async _ready(){
      if(this.session && this.session.expires_at * 1000 < Date.now() + 60000) await this.refresh();
    },

    async rest(method, path, body, prefer, anon){
      if(!configured) throw new Error("Supabase isn't set up yet (config.js).");
      if(!anon) await this._ready();
      const go = () => fetch(`${url}/rest/v1/${path}`, {
        method,
        headers: this.headers(Object.assign({ "content-type": "application/json" }, prefer ? { Prefer: prefer } : {}), anon),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let r = await go();
      if(r.status === 401 && !anon && this.session && await this.refresh()) r = await go();
      const text = await r.text();
      let d = null; try{ d = text ? JSON.parse(text) : null; }catch(e){}
      if(!r.ok){
        const m = (d && (d.message || d.msg || d.error)) || ("HTTP " + r.status);
        const err = new Error(/row-level security|permission denied/i.test(m) ? "Not allowed. Sign in under Setup." : m);
        err.status = r.status; throw err;
      }
      return d;
    },

    async upload(path, blob){
      await this._ready();
      if(!this.session) throw new Error("Sign in under Setup to add items.");
      const go = () => fetch(`${url}/storage/v1/object/photos/${enc(path)}`, {
        method: "POST", headers: this.headers({ "content-type": blob.type || "image/jpeg", "x-upsert": "true", "cache-control": "31536000" }), body: blob
      });
      let r = await go();
      if((r.status === 401 || r.status === 403) && await this.refresh()) r = await go();
      if(!r.ok){
        const d = await r.json().catch(() => ({}));
        throw new Error("Photo upload failed: " + (d.message || d.error || r.status));
      }
      return this.publicUrl(path);
    },

    async removePhoto(path){
      if(!path) return;
      await this._ready();
      await fetch(`${url}/storage/v1/object/photos`, {
        method: "DELETE", headers: this.headers({ "content-type": "application/json" }),
        body: JSON.stringify({ prefixes: [path] })
      }).catch(() => {});
    },

    publicUrl(path){ return `${url}/storage/v1/object/public/photos/${enc(path)}`; },

    async settings(){
      const rows = await this.rest("GET", "settings?select=key,value", undefined, null, true);
      const o = {}; (rows || []).forEach(r => o[r.key] = r.value); return o;
    },
    async saveSettings(obj){
      const rows = Object.entries(obj).map(([k, v]) => ({ key: k, value: v }));
      await this.rest("POST", "settings", rows, "resolution=merge-duplicates,return=minimal");
    }
  };
  window.SB = SB;
})();
