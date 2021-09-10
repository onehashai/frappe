frappe.provide("frappe.ui");
frappe.provide("frappe.web_form");
import EventEmitterMixin from '../../frappe/event_emitter';

export default class WebForm extends frappe.ui.FieldGroup {
	constructor(opts) {
		super();
		Object.assign(this, opts);
		frappe.web_form = this;
		frappe.web_form.events = {};
		Object.assign(frappe.web_form.events, EventEmitterMixin);
	}

	prepare(web_form_doc, doc) {
		Object.assign(this, web_form_doc);
		this.fields = web_form_doc.web_form_fields;
		// b24b33eb3d7d1e8d
		if (this.is_embeddable && this.captcha){
			this.fields.push({
				doctype: "Web Form Field",
				fieldname: "captcha_field",
				fieldtype: "HTML",
				hidden: 0,
				label: "Captcha"
			})
		}
		// b24b33eb3d7d1e8d
		this.doc = doc;
	}

	make() {
		super.make();
		this.set_field_values();
		if (this.introduction_text) this.set_form_description(this.introduction_text);
		if (this.allow_print && !this.is_new) this.setup_print_button();
		if (this.allow_delete && !this.is_new) this.setup_delete_button();
		// b24b33eb3d7d1e8d
		if (this.is_new && !this.is_embeddable) this.setup_cancel_button();
		this.setup_primary_action();
		if (this.is_embeddable && this.captcha) this.setup_captcha(this.site_key);
		$(".link-btn").remove();
		// b24b33eb3d7d1e8d

		// webform client script
		frappe.init_client_script && frappe.init_client_script();
		frappe.web_form.events.trigger('after_load');
		this.after_load && this.after_load();
	}

	on(fieldname, handler) {
		let field = this.fields_dict[fieldname];
		field.df.change = () => {
			handler(field, field.value);
		};
	}

	set_field_values() {
		if (this.doc.name) this.set_values(this.doc);
		else return;
	}

	set_default_values() {
		let values = frappe.utils.get_query_params();
		delete values.new;
		this.set_values(values);
	}

	set_form_description(intro) {
		let intro_wrapper = document.getElementById('introduction');
		intro_wrapper.innerHTML = intro;
	}

	add_button(name, type, action, wrapper_class=".web-form-actions") {
		const button = document.createElement("button");
		button.classList.add("btn", "btn-" + type, "btn-sm", "ml-2");
		button.innerHTML = name;
		button.onclick = action;
		document.querySelector(wrapper_class).appendChild(button);
	}

	add_button_to_footer(name, type, action) {
		this.add_button(name, type, action, '.web-form-footer');
	}

	add_button_to_header(name, type, action) {
		this.add_button(name, type, action, '.web-form-actions');
	}

	setup_primary_action() {
		// b24b33eb3d7d1e8d
		if (!this.is_embeddable) {
		this.add_button_to_header(this.button_label || "Save", "primary", () =>
			this.save()
		);
		}
		// b24b33eb3d7d1e8d
		this.add_button_to_footer(this.button_label || "Save", "primary", () =>
			this.save()
		);
	}

	setup_cancel_button() {
		this.add_button_to_header(__("Cancel"), "light", () => this.cancel());
	}

	// b24b33eb3d7d1e8d
	setup_captcha(key) {
		frappe.require("https://www.google.com/recaptcha/api.js?onload=onloadCallback&render=explicit&type=api.js")
		let captcha;
		let el = document.querySelector('[data-fieldname="captcha_field"]');
		window.onloadCallback = function() {
			captcha = grecaptcha.render(el, {
				'sitekey' :  key
			});
		}

		frappe.web_form.after_load = () => {
			frappe.web_form.set_df_property('captcha_field', 'hidden', 0);
		}

		frappe.web_form.validate = () => {
			if (!grecaptcha.getResponse(captcha)) {
				frappe.throw("Please complete the captcha");
			} else {
				frappe.web_form.doc['captcha_field'] = '';
				return true;
			}
		}
	}
	// b24b33eb3d7d1e8d

	setup_delete_button() {
		this.add_button_to_header(
			frappe.utils.icon('delete'),
			"danger",
			() => this.delete()
		);
	}

	setup_print_button() {
		this.add_button_to_header(
			frappe.utils.icon('print'),
			"light",
			() => this.print()
		);
	}

	save() {
		let is_new = this.is_new;
		if (this.validate && !this.validate()) {
			frappe.throw(__("Couldn't save, please check the data you have entered"), __("Validation Error"));
		}

		// validation hack: get_values will check for missing data
		let doc_values = super.get_values(this.allow_incomplete);

		if (!doc_values) return;

		if (window.saving) return;
		let for_payment = Boolean(this.accept_payment && !this.doc.paid);

		Object.assign(this.doc, doc_values);
		this.doc.doctype = this.doc_type;
		this.doc.web_form_name = this.name;

		// Save
		window.saving = true;
		frappe.form_dirty = false;

		frappe.call({
			type: "POST",
			method: "frappe.website.doctype.web_form.web_form.accept",
			args: {
				data: this.doc,
				web_form: this.name,
				docname: this.doc.name,
				for_payment
			},
			callback: response => {
				// Check for any exception in response
				if (!response.exc) {
					// Success
					this.handle_success(response.message);
					frappe.web_form.events.trigger('after_save');
					this.after_save && this.after_save();
					// args doctype and docname added to link doctype in file manager
					if (is_new) {
						frappe.call({
							type: 'POST',
							method: "frappe.handler.upload_file",
							args: {
								file_url: response.message.attachment,
								doctype: response.message.doctype,
								docname: response.message.name
							}
						});
					}
				}
			},
			always: function() {
				window.saving = false;
			}
		});
		return true;
	}

	delete() {
		frappe.call({
			type: "POST",
			method: "frappe.website.doctype.web_form.web_form.delete",
			args: {
				web_form_name: this.name,
				docname: this.doc.name
			}
		});
	}

	print() {
		window.open(`/printview?
			doctype=${this.doc_type}
			&name=${this.doc.name}
			&format=${this.print_format || "Standard"}`, '_blank');
	}

	cancel() {
		window.location.href = window.location.pathname;
	}

	handle_success(data) {
		// b24b33eb3d7d1e8d
		if (this.accept_payment && !this.doc.paid) {
			if (this.is_embeddable){
					window.top.location.href = data;
			}else{
				window.location.href = data;
			}
		}

		const success_dialog = new frappe.ui.Dialog({
			title: __("Saved Successfully"),
			primary_action_label:  "Done",
			primary_action: () => {
				if (this.success_url) {
					if (this.is_embeddable){
						window.top.location.href = this.success_url;
					}else{
						window.location.href = this.success_url;
					}
					
				} else if(this.login_required) {
					window.location.href =
						window.location.pathname + "?name=" + data.name;
				}
			}
		});

		success_dialog.show();
		const success_message =
			this.success_message || __("Your information has been submitted");
		success_dialog.set_message(success_message);
		// b24b33eb3d7d1e8d
	}
}
