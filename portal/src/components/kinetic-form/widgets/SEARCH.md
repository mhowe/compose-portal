[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Search Widget

The search widget renders a typeahead style search field that can be configured to filter static data, or search data retrieved through an integration.

```js
// Initialize the Markdown widget
bundle.widgets.Search({ container, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Search.get(id);
```

### Parameters

**`container`** — *HTMLElement*  
The HTML element into which the widget should be rendered.

**`config`** — *Object*  
An object of configurations for the widget.

> **`options`** — *Object[]*  
> List of objects to use as the static options for the search functionality.
>
> **`search`** — *Object*  
> Search configuration for how the user typed in value should be used in filtering the results when static options are provided.
>
> > **`fields`** — *Object[]*  
> > A list of fields that should be searched in the static list of options. This is ignored if the <code>fn</code> property is provided.
> >
> > > **`name`** — *string*  
> > > The name of the property to search.
> > >
> > > **`value`** — *any*  
> > > The value that the option must match to be accepted. If omitted, the typed in user query will be used.
> > >
> > > **`operator`** — *'equals'|'matches'|'startsWith'*  
> > > The operation type to use when searching through the options. Defaults to "startsWith".
> >
> > **`fn(options, query)`** — *Function*  
> > A function to use for filtering the options based on the user query. It takes the list of options and the search query, and returns a filtered list of options.
>
> **`integration`** — *Object*  
> Data defining the integration to use for retrieving data for the search functionality.
>
> > **`kappSlug`** — *string*  
> > The slug of the kapp in which the integration exists.
> >
> > **`formSlug`** — *string*  
> > The slug of the form in which the integration exists. If omitted, a kapp integration will be used.
> >
> > **`integrationName`** — *string*  
> > The name of the integration to use.
> >
> > **`listProperty`** — *string*  
> > The name of the output property of the integration response that contains the list data to use.
> >
> > **`parameters`** — *Object[]*  
> > A list of parameters that should be passed into the integration.
> >
> > > **`name`** — *string*  
> > > The name of the parameter to pass into the integration.
> > >
> > > **`value`** — *any*  
> > > The value to set the parameter to. If omitted, the typed in user query will be used.
>
> **`initialSelection`** — *Object*  
> The option object that should be initially selected when the widget loads.
>
> **`optionToValue(option)`** — *Function*  
> Function that takes the current option and returns a value that can uniquely identify this option. If omitted, the `value` property of the option will be used.
>
> **`optionToLabel(option)`** — *Function*  
> Function that takes the current option and returns a label that is rendered in the field when the option is selected. if omitted, the `label` property of the option will be used if it exists, otherwise the value from `optionToValue` will be used.
>
> **`optionToTitle(option)`** — *Function*  
> Function that takes the current option and returns a title that is rendered in the list of options when the option is shown. If omitted, the label from `optionToLabel` will be used.
>
> **`optionToDescription(option)`** — *Function*  
> Function that takes the current option and returns a description that is rendered in the list of options when the option is shown. If omitted, a description will not be shown.
>
> **`selectionBehavior`** — *'replace'|'clear'|'preserve'*  
> Behavior of the field when an option is selected: 'replace' (default) will show the option label, 'clear' will empty the field, and 'preserve' will keep the user's query.
>
> **`minSearchLength`** — *number*  
> The number of character that need to be typed in before options are shown. Defaults to `1`.
>
> **`onChange(selection, value)`** — *Function*  
> Function called when the value is changed. It is passed two parameters, the `selection` which is the selected option object, and the `value` string.
>
> **`onFocus(event)`** — *Function*  
> Function called when the field is focused.
>
> **`onBlur(event)`** — *Function*  
> Function called when the field is blurred.
>
> **`disabled`** — *boolean*  
> Should the field be disabled.
>
> **`placeholder`** — *string*  
> Placeholder to render in the field when it is empty.
>
> **`icon`** — *string*  
> Name of the icon to render in the field. Defaults to `search`.
>
> **`messages`** — *Object*  
> Object of status messages to display during various states.
>
> > **`short`** — *string*  
> > Message to display when there are not enough character typed in to trigger a search.
> >
> > **`empty`** — *string*  
> > Message to display when there are no results matching the query.
> >
> > **`pending`** — *string*  
> > Message to display when options are being retrieved or filtered.

**`id`** — *string*  
A unique id that can be used to retrieve the API of the widget.

### API

**`getSelection()`** — *Function*  
Returns the currently selected option object.

**`setSelection(newSelection)`** — *Function*  
Sets the selection of the search field. The `newSelection` parameter must be an object of the same shape as the options the field uses.

**`enable()`** — *Function*  
Disables the search field.

**`disable()`** — *Function*  
Enables the search field.

### Examples

```js
// Render a search field that uses an integration
bundle.widgets.Search({
  // Render the widget into a Content element names "Requested For Widget"
  container: K('content[Requested For Widget]').element(),
  config: {
    // Use an integration to retrieve the options
    integration: {
      kappSlug: K('kapp').slug(),
      formSlug: K('form').slug(),
      integrationName: 'Search Users',
      listProperty: 'users',
      parameters: [{ name: 'Requested For' }],
    },
    // Define how to get the unique value for each option
    optionToValue: function (o) {
      return o.username;
    },
    // Define how to build a label for each option
    optionToLabel: function (o) {
      return o.displayName || o.username;
    },
    // When an option is selected in the search field, store the value in
    // a Text field named "Requested For"
    onChange: function (obj, value) {
      K('field[Requested For]').value(value);
    },
    placeholder: 'Search users...',
  },
  id: 'requested-for',
});

// Programatically clear the selection
bundle.widgets.Search.get('requested-for').setSelection();

// Programatically set the selection to the current user
bundle.widgets.Search.get('requested-for').setSelection(K('identity'));
```
