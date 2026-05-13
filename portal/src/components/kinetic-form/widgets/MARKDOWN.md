[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Markdown Widget

The markdown widget renders a markdown editor (or viewer when disabled), allowing users to use a WYSIWYG markdown editor to input content, which will then be stored in a text field of the form.

```js
// Initialize the Markdown widget
bundle.widgets.Markdown({ container, field, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Markdown.get(id);
```

### Parameters

**`container`** — *HTMLElement*  
The HTML element into which the widget should be rendered.

**`field`** — *Object*  
The Kinetic field object of a text field with 2+ rows that should be used to store the value of the raw markdown content. The value of the field will be used as the initial value for the editor.

**`config`** — *Object*  
An object of configurations for the widget.

> **`className`** — *string*  
> Additional class names to add to the wrapper of the widget.
>
> **`content`** — *string*  
> If you don't provide a field that stores the data, you can pass in content to render instead. Passing in content will render the markdown content instead of an editor.
>
> **`disabled`** — *boolean*  
> Should the editor be disabled. If omitted, this will be set to `true` if the form is in review mode. When `disabled` is `true`, this widget will render the markdown content instead of an editor.
>
> **`editorProps`** — *Object*  
> Object of props to pass through to the editor component. See the `@toast-ui/react-editor` `Editor` component for valid options.

**`id`** — *string*  
A unique id that can be used to retrieve the API of the widget.

### API

**`getValue()`** — *Function*  
Returns the current text value of the editor content.

**`setValue(newValue)`** — *Function*  
Sets the value of the markdown editor to the provided `newValue`.

**`enable()`** — *Function*  
Disables the editor, and renders the markdown in a viewer instead.

**`disable()`** — *Function*  
Enables the editor and renders the content in editable mode.

### Examples

```js
// Renders a markdown editor
bundle.widgets.Markdown({
  // Render the widget into a Content element named "Markdown"
  container: K('content[Markdown]').element(),
  // Use a Text field names "Markdown Content" to store the data from the editor
  field: K('field[Markdown Content]'),
  config: {},
  id: 'my-markdown',
});
```
