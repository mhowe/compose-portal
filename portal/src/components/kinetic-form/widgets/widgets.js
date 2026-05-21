import { Activity } from './activity.jsx';
import { AIBuilderChat } from './ai-builder-chat.jsx';
import { AIBuilderSettings } from './ai-builder-settings.js';
import { AIBuilderWorkspace } from './ai-builder-workspace.jsx';
import { BundleAvatar } from './bundle-avatar.jsx';
import { BundleBanner } from './bundle-banner.jsx';
import { BundleChrome } from './bundle-chrome.jsx';
import { BundleChromeToggle } from './bundle-chrome-toggle.jsx';
import { BundleContainer } from './bundle-container.jsx';
import { BundleCounter } from './bundle-counter.jsx';
import { BundleHeader } from './bundle-header.jsx';
import { BundleLink } from './bundle-link.jsx';
import { BundleLogo } from './bundle-logo.jsx';
import { BundleMenu } from './bundle-menu.jsx';
import { BundleSearch } from './bundle-search.jsx';
import { Categories } from './categories.jsx';
import { Chart } from './chart.jsx';
import { Forms } from './forms.jsx';
import { Kapps } from './kapps.jsx';
import { Markdown } from './markdown.js';
import { Profile } from './profile.jsx';
import { Search } from './search.js';
import { Signature } from './signature.js';
import { Subform } from './subform.js';
import { SubmissionDetails } from './submission-details.jsx';
import { Table } from './table.js';
import { Theme } from './theme.jsx';

import utils from './utils.js';

// Defines a map of available widgets
const AVAILABLE_WIDGETS = {
  Activity,
  AIBuilderChat,
  AIBuilderSettings,
  AIBuilderWorkspace,
  BundleAvatar,
  BundleBanner,
  BundleChrome,
  BundleChromeToggle,
  BundleContainer,
  BundleCounter,
  BundleHeader,
  BundleLink,
  BundleLogo,
  BundleMenu,
  BundleSearch,
  Categories,
  Chart,
  Forms,
  Kapps,
  Markdown,
  Profile,
  Search,
  Signature,
  Subform,
  SubmissionDetails,
  Table,
  Theme,
};

// Ensure the bundle global object exists
const bundle = window.bundle ?? {};
// Create the widgets namespace if it doesn't exist
bundle.widgets ??= {};
// Create a utils namespace and set it to the utils functions
bundle.utils ??= utils;

// Assign widgets to the namespace, while adding some static properties to each
// widget function that will be used in the maintenance of the widget instances
Object.assign(
  bundle.widgets,
  Object.fromEntries(
    Object.entries(AVAILABLE_WIDGETS).map(([name, widget]) => [
      name,
      Object.assign(widget, {
        // Add a map to store active instances of this widget's API
        instances: {},
        // Add a function to get an instance of this widget's API via an ID
        get(id) {
          return this.instances[id];
        },
      }),
    ]),
  ),
);
