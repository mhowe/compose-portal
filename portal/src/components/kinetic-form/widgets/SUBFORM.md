[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Subform Widget

The subform widget renders a Kinetic form in either a modal or inline, allowing users to provide additional information, and the builder to collect the data and store it however they find appropriate.

```js
// Initialize the Subform widget
bundle.widgets.Subform({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Subform.get(id);
```

### Parameters

**`container`** — *HTMLElement*  
The HTML element into which the widget should be rendered.

**`config`** — *Object*  
An object of configurations for the widget.

> **`kappSlug`** — *string*  
> The slug of the kapp in which the subform you want to render exists.
>
> **`formSlug`** — *string*  
> The slug of the form you want to render.
>
> **`submissionId`** — *string*  
> The submission id of the submission you want to render.
>
> **`fields`** — *Object[]*  
> A list of custom field definitions to render as a form instead of using a Kinetic form.
>
> > **`label`** — *string*  
> > The label of the field.
> >
> > **`property`** — *string*  
> > The property name that this field's data will be stored under in the resulting data object.
> >
> > **`type`** — *string*  
> > The type of field to render. Available options are 'text', 'checkbox', 'date', 'datetime', or 'time'. Fields without a type will not be rendered.
> >
> > **`defaultValue`** — ***  
> > The default value for the field, used if the `values` configuration is not provided.
> >
> > **`required`** — *boolean*  
> > Should the field be required. Defaults to false.
> >
> > **`disabled`** — *boolean*  
> > Should the field be disabled. Defaults to false.
> >
> > **`validate(value, data)`** — *Function*  
> > Validation function for validating this field. It should return an array of error messages if the field is invalid.
>
> **`values`** — *Object*  
> Map of default field values to use for the form.
>
> **`disabled`** — *boolean*  
> Should the form be rendered with disabled fields.
>
> **`onLoad(api)`** — *Function*  
> Function that's called when the subform is loaded.  
> It is passed an `api` object which contains the following properties:  
> `kForm`: A function that returns the kinetic form object. Only available if a Kinetic subform is loaded.
> `destroy`: A function that closes the subform.  
> `toasterId`: A string id that can be provided to the Toast functions to render a toast inside the context of the subform modal.
>
> **`onSave(data, api)`** — *Function*  
> Function that's called when the save button of the widget is clicked. If omitted, the save button will not be rendered.  
> It is passed a `data` object representing the form data, and an `api` object which contains the following properties:  
> `destroy`: A function that closes the subform.  
> `toasterId`: A string id that can be provided to the Toast functions to render a toast inside the context of the subform modal.
>
> **`onError(api)`** — *Function*  
> Function that's called when the subform fails to load. Only called if attempting to load a Kinetic form.  
> It is passed an `api` object which contains the following properties:  
> `destroy`: A function that closes the subform.  
> `toasterId`: A string id that can be provided to the Toast functions to render a toast inside the context of the subform modal.
>
> **`inline`** — *boolean*  
> Should the form render inline instead of in a modal.
>
> **`modalTitle`** — *string*  
> The title for the modal when the subform is rendered in a modal.
>
> **`modalSize`** — *string*  
> The size of the modal when the subform is rendered in a modal. Accepts `sm` (default), `md`, `lg`, and `xl`.
>
> **`saveLabel`** — *string*  
> The label for the save button.

**`id`** — *string*  
A unique id that can be used to retrieve the API of the widget.

### API

**`data()`** — *Function*  
Returns the current data object.

**`kForm()`** — *Function*  
Returns the Kinetic form object of the subform. Only available if a Kinetic subform was loaded.

**`toasterId`** — *string*  
Id that can be passed into the toast utilities to render a toast in the context of the subform modal. This should be done if you want to render a toast while the modal remains open.

### Examples

```js
// Renders an inline subform
bundle.widgets.Subform({
  // Render the widget into a Content element named "Subform Container"
  container: K('content[Subform Container]').element(),
  config: {
    // Define the form we want to render
    kappSlug: kapp('slug'),
    formSlug: 'employee-address',
    // Provide default values for the form
    values: { State: 'MN' },
    // Set inline to true to render the subform directly within the parent form
    inline: true,
  },
  id: 'address-subform',
});

// Get the Kinetic form object of the subform
bundle.widgets.Subform.get('address-subform').kForm();

// Get the data of the subform as JSON
bundle.widgets.Subform.get('address-subform').data();
```

```js
// Renders a subform in a modal, and stores its JSON data in a field on the form
bundle.widgets.Subform({
  // Render the widget into a Content element named "Subform Container"
  container: K('section[Subform Container]').element(),
  config: {
    // Define the form we want to render
    kappSlug: kapp('slug'),
    formSlug: 'employee-address',
    // Define the title for the modal
    modalTitle: 'Address Information',
    // Define an onSave function that will be triggered when the user clicks
    // the save button in the modal
    onSave: function (data, api) {
      // Store the stringified result of the subform into a text field
      K('field[Address JSON]').value(JSON.stringify(data));
      // Show a success toast
      bundle.utils.toastSuccess({ title: 'Address added successfully' });
      // CLose the subform
      api.destroy();
    },
  },
  id: 'address-subform',
});
```

```js
// Renders a subform in a modal and submits it to create a submission
bundle.widgets.Subform({
  // Render the widget into a Content element named "Subform Container"
  container: K('section[Subform Container]').element(),
  config: {
    // Define the form we want to render
    kappSlug: kapp('slug'),
    formSlug: 'employee-address',
    // Define the title for the modal
    modalTitle: 'Address Information',
    // Define the label for the modal save button
    saveLabel: 'Submit Address',
    // Define an onSave function that will be triggered when the user clicks
    // the save button in the modal
    onSave: function (data, api) {
      // Call the `submitPage` function to submit the subform
      api.submit(function () {
        // Show a success toast
        bundle.utils.toastSuccess({ title: 'Address added successfully' });
        // Close the subform
        actions.close();
      });
    },
  },
  id: 'address-subform',
});
```

```js
// Renders a form with custom fields in a modal
bundle.widgets.Subform({
  // Render the widget into a Content element named "Subform Container"
  container: K('section[Subform Container]').element(),
  config: {
    // Define the fields we want to render
    fields: [
      {
        label: 'Address',
        property: 'address',
        type: 'text',
        required: true,
        validate: function (value) {
          if (!value.match(/$\d+'/)) {
            return ['Address must start with a number'];
          }
        },
      },
      {
        label: 'City, State, Zip',
        property: 'address2',
        type: 'text',
        required: true,
      },
      {
        label: 'This is my current address',
        property: 'current',
        type: 'checkbox',
        defaultValue: true,
      },
      {
        label: 'Date',
        property: 'date',
        type: 'date',
        defaultValue: new Date().toISOString().slice(0, 10),
        disabled: true,
      },
    ],
    // Define the title for the modal
    modalTitle: 'Address Information',
    // Define an onSave function that will be triggered when the user clicks
    // the save button in the modal
    onSave: function (data, api) {
      // TODO: Do something with the data
      // Then close the modal
      api.destroy();
    },
  },
  id: 'address-subform',
});
```
