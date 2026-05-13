[&#x2B9C; Back to Kinetic Form Widgets](README.md#available-widgets)

## Table Widget

The table widget renders a table of data that can either be passed in as a static list, extracted from a Kinetic form field, or retrieved via an integration. The table provides configurations for sorting, filtering, pagination, and custom events to modify the data.

```js
// Initialize the Table widget
bundle.widgets.Table({ container, field, config, id });

// Retrieve a reference to the widget's API
bundle.widgets.Table.get(id);
```

### Parameters

**`container`** — *HTMLElement*  
The HTML element into which the widget should be rendered.

**`field`** — *Object*  
The Kinetic field object of a text field that should be used to store the stringified table data of the table. The value of the field will be parsed and used as the initial values for the table if no `data` or `integration` configurations are provided.

**`config`** — *Object*  
An object of configurations for the widget.

> **`data`** — *Object[]*  
> List of data used to populate the table when initialized.
>
> **`integration`** — *Object*  
> Data defining the integration to use for retrieving data for the table.
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
> > **`errorProperty`** — *string*  
> > The name of the output property of the integration response that contains the error if one occurs when retrieving the data.
> >
> > **`parameters`** — *Object*  
> > A map of parameters that should be passed into the integration.
>
> **`rowTransform(row)`** — *Function*  
> A transform function which will be applied to each row of data before the data is used in the table.
>
> **`onDataError(error)`** — *Function*  
> A callback function that is triggered if there is an error retrieving the data for the table.
>
> **`onDataSuccess(rows)`** — *Function*  
> A callback function that is triggered when the data for the table is successfully retrieved. This happens on initialization, and each time the data is reloaded.
>
> **`sortable`** — *boolean*  
> Should the table allow sorting the data. Defaults to `true`.
>
> **`filterable`** — *boolean*  
> Should the table allow filtering the data. Defaults to `true`.
>
> **`toggleable`** — *boolean*  
> Should the table allow changing the visibility of columns. Defaults to `true`.
>
> **`columns`** — *Object[]*  
> List of configurations for defining the columns of the table.
>
> > **`label`** — *string*  
> > The text to render in the header cell of the column.
> >
> > **`property`** — *string*  
> > The key used to retrieve the value for this column from the row data. This is required and must be unique across all columns.
> >
> > **`displayTransform(value, row)`** — *Function*  
> > A transform function whose result will be rendered in the body cell of the column. This can be used to change or format the value. Defaults to the actual value.  
> > It is passed the `value` of the cell, and the `row` object, containing all values for the row.
> >
> > **`sortable`** — *boolean*  
> > Can the table be sorted by this column (if the table allows sorting). Defaults to `true`.
> >
> > **`sortTransform(value, row)`** — *Function*  
> > A transform function whose result will be used when sorting by this column. Defaults to the actual value.  
> > It is passed the `value` of the cell, and the `row` object, containing all values for the row.
> >
> > **`filterable`** — *boolean*  
> > Can the table be filtered on this column's data (if the table allows filtering). Defaults to `true`.
> >
> > **`filterTransform(value, row)`** — *Function*  
> > A transform function whose result will be used when filtering data. Defaults to the actual value.  
> > It is passed the `value` of the cell, and the `row` object, containing all values for the row.
> >
> > **`filterOperator`** — *'matches'|'equals'|'startsWith'*  
> > The type of operator used when filtering this column's data. All filtering is case-insensitive. Defaults to `matches`.  
> > Possible options are:  
> > `matches` - checks if the query matches any part of cell value.  
> > `equals` - checks if the query exactly matches the entire cell value.  
> > `startsWith` - checks if the query matches the start of the cell value.
> >
> > **`filterFn(query, value, row)`** — *Function*  
> > A custom function used when filtering data. It should return `true` if the cell matches the query. When provided, the `filterOperator` is ignored.  
> > It is passed the `query` value, the `value` of the cell, and the `row` object containing all values for the row.  
> > The provided `query` and `value` parameters have not had their case synchronized.
> >
> > **`visible`** — *boolean*  
> > Should the column be visible when the table is rendered.
> >
> > **`toggleable`** — *boolean*  
> > Can the visibility of the column be toggles (if the table allows toggling column visibility).
> >
> > **`onClick(row, index, tableApi)`** — *Function*  
> > Function that when provided, the cell value will be rendered as a button, and this function will be triggered when the cell value is clicked.  
> > It is passed a `row` object containing the data of the row, the `index` of the row (the absolute index from all data, not just the current page), and a `tableApi` parameter, which provides access to the [API](#api) functions defined below.
> >
> > **`footerTransform(currentRows, tableApi)`** — *Function*  
> > Function that generates a value for the footer of the column. A footer is only rendered if at least one column provides this function.  
> > It is passed a `currentRows` list containing the currently visible rows of the table, and a `tableApi` parameter, which provides access to the [API](#api) functions defined below.
> >
> > **`headerCellClass`** — *string*  
> > A string of classes to add to the header cell of this column.
> >
> > **`bodyCellClass`** — *string*  
> > A string of classes to add to the body cell of this column.
> >
> > **`footerCellClass`** — *string*  
> > A string of classes to add to the footer cell of this column.
> >
> > **`headerCellStyles`** — *Object*  
> > An object of styles to add to the header cell of this column. Any style names that have hyphens should instead use camelCase.
> >
> > **`bodyCellStyles`** — *Object*  
> > An object of styles to add to the body cell of this column. Any style names that have hyphens should instead use camelCase.
> >
> > **`footerCellStyles`** — *Object*  
> > An object of styles to add to the footer cell of this column. Any style names that have hyphens should instead use camelCase.
> >
> > **`fieldConfig`** — *Object*  
> > Configuration object used for rendering the columns as a form, used for the built-in row add and update actions. This data is passed to the `fields` configuration of the `Subform` widget, which is used behind the scenes for this functionality.
> >
> > > **`type`** — *string*  
> > > The type of field to render. Available options are 'text', 'checkbox', 'date', 'datetime', or 'time'. Fields without a type will not be rendered.
> > >
> > > **`required`** — *boolean*  
> > > Should the field be required. Defaults to false.
> > >
> > > **`disabled`** — *boolean*  
> > > Should the field be disabled. Defaults to false.
> > >
> > > **`validate(value, data)`** — *Function*  
> > > Validation function for validating this field. It should return an array of error messages if the field is invalid.
>
> **`addAction`** — *Object*  
> Configuration for the add row button. If omitted, the button will not be rendered.
>
> > **`label`** — *string*  
> > The label for the add row button. Defaults to 'Add Row'.
> >
> > **`icon`** — *string*  
> > The name of the Tabler icon to use for the add row button. Defaults to 'plus'.
> >
> > **`onClick(tableApi)`** — *Function*  
> > Function to call when the add row button is clicked.  
> > It is passed a `tableApi` parameter, which provides access to the [API](#api) functions defined below.
>
> **`rowActions`** — *Object[]*  
> List of configurations for buttons that should be rendered in each row of the table.
>
> > **`label`** — *string*  
> > The label for the button. It is not rendered but used for accessibility.
> >
> > **`icon`** — *string*  
> > The name of the Tabler icon to use for the button.
> >
> > **`onClick(row, index, tableApi)`** — *Function*  
> > Function to call when the button is clicked.  
> > It is passed a `row` object containing the data of the row, the `index` of the row (the absolute index from all data, not just the current page), and a `tableApi` parameter, which provides access to the [API](#api) functions defined below.
>
> **`selectAction`** — *Object*  
> Configuration for the row click/select callback. If omitted, rows will not be clickable.
>
> > **`label`** — *string*  
> > A label for the hidden select button. It is not rendered but used for accessibility.
> >
> > **`onClick(row, index, tableApi)`** — *Function*  
> > Function to call when the row is clicked.  
> > It is passed a `row` object containing the data of the row, the `index` of the row (the absolute index from all data, not just the current page), and a `tableApi` parameter, which provides access to the [API](#api) functions defined below.
>
> **`pageSize`** — *number*  
> The number of rows that should be shown per page. Use `0` to show all rows. Defaults to `10`.
>
> **`pageSizes`** — *number[]*  
> List of page sizes that the user can select from. Set to an empty array to disable changing the page size. Defaults to `[10, 25, 50]`.
>
> **`defaultSort`** — *number | [number, string]*  
> The default sort configuration. It can either be a number representing which column to sort by, or an array containing a number representing the column, and a direction of `asc` or `desc`.
>
> **`title`** — *string*  
> The heading text to render above the table.
>
> **`allowExport`** — *boolean*  
> Should the table allow exporting its data to a CSV. Default to `true`. The above `title` will be used as the filename.
>
> **`messages`** — *Object*  
> Map of messages to render during various table states.
>
> > **`empty`** — *string*  
> > The text to render when there are no rows in the table. Defaults to `No rows found.`.
> >
> > **`loading`** — *string*  
> > The text to render when the data is loading. Defaults to `Loading...`.
> >
> > **`noMatches`** — *string*  
> > The text to render when no rows match the entered filter query. Defaults to `No rows match your filter.`.

**`id`** — *string*  
A unique id that can be used to retrieve the API of the widget.

### API

**`getData()`** — *Function*  
Returns the full list of data used by the table.

**`reloadData()`** — *Function*  
Only available when the table uses an integration for its data. Re-fetches the data from the integration.

**`addRow(row)`** — *Function*  
Adds the provided `row` to the list of table data, and then re-sorts the table by the current sort, if any.

**`updateRow(row, index)`** — *Function*  
Updates the row at the provided absolute `index` with the data from the provided `row`.

**`deleteRow(index)`** — *Function*  
Deletes the row at the provided absolute `index`.

**`actions`** — *Object*  
Actions that provide built-in functionality for editing the data.

> **`add(options)`** — *Function*  
> A function that triggers a modal form to be rendered with fields for all columns that provided a `fieldConfig`. Completing the modal form adds a new row to the table.  
> It accepts an `options` object which is passed through to the config of the `Subform` widget that's used for this functionality.  
> The `options` object can also define a `successMessage` that is shown is the toast when the row is added. Defaults to `Row was added successfully.`.
>
> **`update(row, ,index, options)`** — *Function*  
> A function that triggers a modal form to be rendered with fields for all columns that provided a `fieldConfig`, and uses the provided `row` as the initial values. Completing the modal updates the row at the provided absolute `index`.  
> It accepts an `options` object as the third parameter, which is passed through to the config of the `Subform` widget that's used for this functionality.  
> The `options` object can also define a `successMessage` that is shown is the toast when the row is added. Defaults to `Row was updated successfully.`.
>
> **`delete(index, options)`** — *Function*  
> A function that triggers a confirmation modal to verify the user wants to delete the row. Accepting the confirmation deletes the row at the provided absolute `index`.  
> It accepts an `options` object as the second parameter, which is passed through to the config of the `openConfirm` utils function that's used for this functionality.  
> The `options` object can also define a `successMessage` that is shown is the toast when the row is added. Defaults to `Row was deleted successfully.`.
>
> **`subform(options)`** — *Object*  
> A shortcut to the `Subform` widget. Accepts an `options` object, same as one you would pass to the `Subform` widget itself. Using this function doesn't require you to pass a `container` because it will use a container provided by the `Table` widget.

### Examples

```js
// Renders a table that displays data from an integration
bundle.widgets.Table({
  container: K('content[Integration Table]').element(),
  config: {
    title: 'Addresses',
    // Configuration for an integration that returns Address submissions
    integration: {
      kappSlug: K('kapp').slug(),
      formSlug: K('form').slug(),
      integrationName: 'Addresses',
      listProperty: 'Data',
      errorProperty: 'Error',
    },
    // Transform the data to a single level map, so that Value aren't nested
    rowTransform: ({ Values, ...row }) => ({ ...row, ...Values }),
    // Define columns
    columns: [
      {
        label: 'Id',
        property: 'Handle',
        // Modify the rendered value of this column to also include the Core State
        displayTransform: (value, row, index) =>
          value + ' (' + row['Core State'] + ')',
        // Don't allow hiding this column
        toggleable: false,
      },
      {
        label: 'Address',
        property: 'Address Line 1',
        // When sorting by Adddress, remove any leading digits before sorting
        sortTransform: value => (value || '').match(/^\d*\s*(.*)$/)[1],
      },
      {
        label: 'Address Line 2',
        property: 'Address Line 2',
        // Hide column by default
        visible: false,
      },
      {
        label: 'City',
        property: 'City',
      },
      {
        label: 'State',
        property: 'State',
        // Add a footer for this column that shows the count of unique states in the table
        footerTransform: function (currentRows, tableApi) {
          const uniqueStates = Object.keys(
            tableApi
              .getData()
              .reduce(
                (result, row) => ({ ...result, [row['State']]: true }),
                {},
              ),
          ).length;
          return `${uniqueStates} States`;
        },
        // Styles the text in this column to be red
        headerCellStyles: { color: 'red' },
        bodyCellStyles: { color: 'red' },
        footerCellStyles: { color: 'red' },
      },
      {
        label: 'Zip Code',
        property: 'Zip Code',
        // Search zip code using starts with when filtering data
        filterOperator: 'startsWith',
      },
    ],
    pageSize: 5,
    pageSizes: [5, 10, 20, 50, 0],
    // Sort using the first column in ascending order by default
    defaultSort: [0, 'asc'],
    messages: {
      loading: 'Loading addresses',
      empty: 'There are no addresses',
      noMatches: 'No addresses match your filter query',
    },
  },
  id: 'addresses-table',
});
```

```js
// Renders a table that displays data from an integration and allows for editing
// the data by editing the submissions using a subform
bundle.widgets.Table({
  container: K('content[Editable Integration Table]').element(),
  config: {
    title: 'Addresses',
    // Configuration for an integration that returns Address submissions
    integration: {
      kappSlug: K('kapp').slug(),
      formSlug: K('form').slug(),
      integrationName: 'Addresses',
      listProperty: 'Data',
      errorProperty: 'Error',
    },
    // Transform the data to a single level map, so that Value aren't nested
    rowTransform: ({ Values, ...row }) => ({ ...row, ...Values }),
    // Define columns
    columns: [
      {
        label: 'Submission Id',
        property: 'Submission Id',
        // We need this data in the row for edit actions, but don't want to show it
        visible: false,
        toggleable: false,
      },
      {
        label: 'Id',
        property: 'Handle',
        // Don't allow hiding this column
        toggleable: false,
      },
      {
        label: 'Address',
        property: 'Address Line 1',
      },
      {
        label: 'Address Line 2',
        property: 'Address Line 2',
        // Hide column by default
        visible: false,
      },
      {
        label: 'City',
        property: 'City',
      },
      {
        label: 'State',
        property: 'State',
      },
      {
        label: 'Zip Code',
        property: 'Zip Code',
      },
    ],
    // Define an action for adding new rows
    addAction: {
      label: 'Add Row',
      onClick: function (tableApi) {
        // When the add row button is clicked, open a subform using the Subform
        // widget so we can allow creating new submissions
        tableApi.actions.subform({
          config: {
            // Provide the kapp and form slugs so we can open a blank form
            kappSlug: kapp('slug'),
            formSlug: 'addresses',
            modalTitle: 'New Address',
            saveLabel: 'Create',
            onSave: function (data, api) {
              // When the save button is clicked, submit the form using the
              // Kinetic form API and provide a callback function
              api.submit(function (result) {
                // Add row to the table so it appears immediately before the
                // table reloads
                tableApi.addRow({
                  // Transform the data of the submission into the structure the
                  // table expects
                  Handle: result.submission.handle,
                  'Core State': result.submission.coreState,
                  'Address Line 1': result.submission.values['Address Line 1'],
                  'Address Line 2': result.submission.values['Address Line 2'],
                  City: result.submission.values['City'],
                  State: result.submission.values['State'],
                  'Zip Code': result.submission.values['Zip Code'],
                });
                // Reload the table data in the background
                tableApi.reloadData();
                // Show success toast
                bundle.utils.toastSuccess({
                  title: 'Address added successfully',
                });
                // Close the subform modal
                api.destroy();
              });
            },
          },
        });
      },
    },
    // Define action buttons for each row of the table
    rowActions: [
      {
        // Define an edit button
        label: 'Edit Row',
        icon: 'pencil',
        onClick: function (row, index, tableApi) {
          // When this button is clicked, open a subform to edit the submission
          // of the current row
          tableApi.actions.subform({
            config: {
              // Provide the submission id so we can open the current submission
              submissionId: row['Submission Id'],
              modalTitle: 'Edit Address',
              saveLabel: 'Update',
              onSave: function (data, api) {
                // When the save button is clicked, submit the form using the
                // Kinetic form API and provide a callback function
                api.submit(function (result) {
                  // Update the row in the table so the changes appear
                  // immediately before the table reloads
                  tableApi.updateRow(
                    {
                      // Transform the data of the submission into the structure the
                      // table expects
                      Handle: result.submission.handle,
                      'Core State': result.submission.coreState,
                      'Address Line 1':
                        result.submission.values['Address Line 1'],
                      'Address Line 2':
                        result.submission.values['Address Line 2'],
                      City: result.submission.values['City'],
                      State: result.submission.values['State'],
                      'Zip Code': result.submission.values['Zip Code'],
                    },
                    index,
                  );
                  // Reload the table data in the background
                  tableApi.reloadData();
                  // Show success toast
                  bundle.utils.toastSuccess({
                    title: 'Address updated successfully',
                  });
                  // Close the subform modal
                  api.destroy();
                });
              },
            },
          });
        },
      },
      {
        // Define a delete button
        label: 'Delete Row',
        icon: 'trash',
        onClick: function (row, index, tableApi) {
          // When this button is clicked, open a confiurmation modal to verify
          bundle.utils.openConfirm({
            title: 'Delete Address',
            description: `Are you sure you want to delete address ${row['Handle']}?`,
            acceptLabel: 'Yes',
            accept: function () {
              // When the confirmation is accepted, call the API to delete the
              // corresponding submission
              K.api(
                'DELETE',
                bundle.apiLocation() + '/submissions/' + row['Submission Id'],
                {
                  complete: function (response) {
                    if (response.status === 200) {
                      // On success of the delete, show a toast
                      bundle.utils.toastSuccess({
                        title: 'Address was successfully deleted',
                      });
                      // Delete the row in the table immediately
                      tableApi.deleteRow(index);
                      // Reload the table data in the background
                      tableApi.reloadData();
                    } else {
                      bundle.utils.toastError({
                        title: 'There was an error deleting the address',
                      });
                    }
                  },
                },
              );
            },
          });
        },
      },
    ],
    pageSize: 5,
    pageSizes: [1, 5, 10, 20, 50, 0],
    // Sort using the first column in ascending order by default
    defaultSort: [0, 'asc'],
    messages: {
      loading: 'Loading addresses',
      empty: 'There are no addresses',
      noMatches: 'No addresses match your filter query',
    },
  },
  id: 'editable-addresses-table',
});
```

```js
// Renders a table that displays static data
bundle.widgets.Table({
  container: K('content[Static Table]').element(),
  config: {
    title: 'Colors',
    // Don't allow filtering the table
    filterable: false,
    // Don't allow changing column visibility
    toggleable: false,
    // Define the data to display in the table
    data: [
      { Name: 'Mindaro', Hex: '#D6FF79' },
      { Name: 'Light Green', Hex: '#B0FF92' },
      { Name: 'Lavender Blush', Hex: '#FFF2F1' },
      { Name: 'Tropical Indigo', Hex: '#A09BE7' },
      { Name: 'Chrysler Blue', Hex: '#5F00BA' },
    ],
    // Define columns
    columns: [
      {
        label: 'Name',
        property: 'Name',
      },
      {
        label: 'Hex Value',
        property: 'Hex',
      },
    ],
    // Define an action when the row itself is clicked
    selectAction: {
      label: 'Select Row',
      onClick: function (row, index, tableApi) {
        // Callback for the row click. Here we show another form element and
        // change its background color to the value from the clicked row.
        K('content[Table Static View Select]').show();
        K('content[Table Static View Select]').element().style.backgroundColor =
          row['Hex'];
      },
    },
    // A page size of 0 shows all rows
    pageSize: 0,
    // Empty pageSizes array will hide the page size selector
    pageSizes: [],
    // Don't allow exports
    allowExport: false,
    messages: { loading: 'Loading colors' },
  },
  id: 'static-table',
});
```

```js
// Renders a table that uses a form field to get initial data, and to store the
// table data in whenever its updated
bundle.widgets.Table({
  container: K('content[Field Table]').element(),
  // Provide the field to tie to this table
  field: K('field[Field Table Data]'),
  config: {
    title: 'Contacts',
    columns: [
      {
        label: 'Name',
        property: 'Name',
        // Make the value of this column a button that updates the row
        onClick: function (row, index, tableApi) {
          // Use the built-in actions to open a modal to update the row
          tableApi.actions.update(row, index);
        },
        // Config for the field corresponding to this column
        fieldConfig: {
          type: 'text',
          required: true,
          label: 'Full Name',
        },
      },
      {
        label: 'Email',
        property: 'Email',
        fieldConfig: {
          type: 'text',
          validate: function (value, data) {
            if (!value && !data['Phone'])
              return ['Either Email or Phone must be provided.'];
          },
        },
      },
      {
        label: 'Phone',
        property: 'Phone',
        fieldConfig: {
          type: 'text',
        },
      },
    ],
    // Define an action for adding new rows
    addAction: {
      label: 'Add Row',
      onClick: function (tableApi) {
        // Use the built-in action to open a modal to add a new row
        tableApi.actions.add();
      },
    },
    // Define actions buttons for each row
    rowActions: [
      {
        // Define a delete button
        label: 'Delete Row',
        icon: 'trash',
        onClick: function (row, index, tableApi) {
          // Use the built-in action to open a confirmation modal before
          // deleting the row
          tableApi.actions.delete(index);
        },
      },
    ],
    messages: {
      loading: 'Loading contacts',
      empty: 'There are no contacts',
      noMatches: 'No contacts match your filter query',
    },
  },
  id: 'field-table',
});
```
