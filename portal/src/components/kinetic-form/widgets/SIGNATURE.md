[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Signature Widget

The signature widget renders a signature element, which opens a modal where the user can draw their signature or type it using a preselected font. The signature is stored as an image attachment field on the form.

```js
// Initialize the Signature widget
bundle.widgets.Signature({ container, field, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Signature.get(id);
```

### Parameters

**`container`** — *HTMLElement*  
The HTML element into which the widget should be rendered.

**`field`** — *Object*  
The Kinetic field object used to store the value of the signature.

**`config`** — *Object*  
An object of configurations for the widget.

> **`modalTitle`** — *string*  
> The title displayed at the top of the signature modal.
>
> **`signaturePadLabel`** — *string*  
> The label displayed above the signature pad.
>
> **`fullNameLabel`** — *string*  
> Label for the full name input field
>
> **`agreementText`** — *string*  
> Agreement text displayed below the signature field
>
> **`savedButtonLabel`** — *string*  
> Name of the saved signature file
>
> **`savedFileName`** — *string*  
> Label for the button that opens the signature modal
>
> **`buttonLabel`** — *string*  
> Label for the button that clears the signature
>
> **`clearButtonLabel`** — *string*  
> Label for the button that clears the signature

**`id`** — *string*  
A unique id that can be used to retrieve the API of the widget.

### API

**`getValue()`** — *Function*  
Retrieves the current value of the signature.

**`reset()`** — *Function*  
Resets the signature field, clearing the stored signature.

### Example

```js
bundle.widgets.Signature({
  container: K('section[Signature Widget]').element(),
  field: K('field[Signature]'),
  config: {
    // Disable in review mode
    disabled: K('form').reviewMode(),
    // Title of the signature modal
    modalTitle: 'Sign your form',
    // Label displayed above the signature pad
    signaturePadLabel: 'Signature',
    // Label for the full name input field
    fullNameLabel: 'Full Name*',
    // Agreement text displayed below the signature field
    agreementText:
      'I understand this is a legal representation of my signature.',
    // Label for the save button
    savedButtonLabel: 'Save',
    //  Name of the saved signature file
    savedFileName: 'signature_widget',
    // Label for the button that opens the signature modal
    buttonLabel: 'Signature',
    // Label for the button that clears the signature
    clearButtonLabel: 'Clear',
  },
  id: 'sig',
});
```
