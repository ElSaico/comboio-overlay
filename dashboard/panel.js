import '../node_modules/jsonform/deps/jquery.min.js';
import '../node_modules/jsonform/deps/opt/jquery-ui.js';
import '../node_modules/underscore/underscore-umd-min.js';
import '../node_modules/jsonform/lib/jsonform.js';

document.addEventListener('DOMContentLoaded', () => {
  function createLabelForm(el, label) {
    const replicant = nodecg.Replicant(label);
    replicant.on('change', value => {
      $(el).empty().jsonForm({
        schema: {
          [label]: { type: 'string' }
        },
        value: { [label]: value },
        onSubmitValid: values => {
          replicant.value = values[label];
        }
      });
    });
  }
  createLabelForm('#follower', 'follower');
  createLabelForm('#subscriber', 'subscriber');
  createLabelForm('#cheer', 'cheer');

  const counters = nodecg.Replicant('counters');
  const mediaFiles = nodecg.Replicant('media-files');
  NodeCG.waitForReplicants(mediaFiles).then(() => {
  counters.on('change', value => {
    $('#counters').empty().jsonForm({
      schema: {
        counters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              command: { type: "string", title: "Command", required: true },
              description: { type: "string", title: "Description", required: true },
              message: { type: "string", title: "Message", description: "Use #### to replace with count" },
              count: { type: "integer", title: "Count", default: 0 },
              play: { type: "string", title: "Play file", enum: [""].concat(mediaFiles.value), allowEmpty: true },
              show: { type: "boolean", title: "Show on screen", required: true }
            }
          }
        }
      },
      form: [
        {
          key: "counters",
          notitle: true,
          items: {
            type: "section",
            items: [
              { key: "counters[].command", prepend: "!" },
              "counters[].description",
              "counters[].message",
              "counters[].count",
              "counters[].play",
              "counters[].show"
            ]
          }
        },
        {
          type: "submit",
          title: "Update"
        }
      ],
      value: { counters: value },
      onSubmitValid: values => {
        counters.value = values.counters;
      }
    });
  });
  });
});
