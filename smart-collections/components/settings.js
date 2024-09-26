export async function render(scope, opts = {}) {
  const html = Object.entries(scope.settings_config).map(([setting_key, setting_config]) => {
    if (!setting_config.setting) setting_config.setting = setting_key;
    if(this.validate_setting(scope, opts, setting_key, setting_config)) return this.render_setting_html(setting_config);
    return '';
  }).join('\n');
  const frag = this.create_doc_fragment(html);
  await this.render_setting_components(frag, {scope});
  return post_process(scope, frag, opts);
}

export async function post_process(scope, frag, opts = {}) {
  return frag;
}