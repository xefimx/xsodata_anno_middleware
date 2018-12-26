const request = require("request-promise");
const parser = require("fast-xml-parser");
const Parser = require("fast-xml-parser").j2xParser;

let metadata = null;

const ENTITY_SET_WHITE_LIST = {
  label: {},
  creatable: {},
  updatable: {},
  "updatable-path": {},
  deletable: {},
  "deletable-path": {},
  searchable: {},
  pageable: {},
  topable: {},
  countable: {},
  addressable: {},
  "requires-filter": {},
  "change-tracking": {},
  maxpagesize: {},
  "delta-link-validity": {},
  semantics: {}
};

const ENITITY_TYPE_WHITE_LIST = {
  label: {},
  heading: {},
  quickinfo: {},
  semantics: {},
  creatable: {},
  updatable: {},
  sortable: {},
  filterable: {},
  "required-in-filter": {},
  "filter-restriction": {},
  text: {},
  unit: {},
  precision: {},
  visible: {},
  "field-control": {},
  "validation-regexp": {},
  "display-format": {},
  "value-list": {},
  "lower-boundary": {},
  "upper-boundary": {},
  "aggregation-role": {},
  "super-ordinate": {},
  "attribute-for": {},
  "hierarchy-node-for": {},
  "hierarchy-node-external-key-for": {},
  "hierarchy-level-for": {},
  "hierarchy-parent-node-for": {},
  "hierarchy-parent-navigation-for": {},
  "hierarchy-drill-state-for": {},
  "hierarchy-node-descendant-count-for": {},
  "hierarchy-preorder-rank-for": {},
  "hierarchy-sibling-rank-for": {},
  parameter: {},
  "is-annotation": {},
  "updatable-path": {},
  "preserve-flag-for": {},
  "filter-for": {}
};

function getOdataUrl(sName) {
  if (!process.env.destinations) {
    throw new Error("No destinations provided at mta.yaml");
  }
  const oDest = JSON.parse(process.env.destinations).filter(
    i => i.name === sName
  )[0];
  if (!oDest) {
    throw new Error(
      `Destination ${sName} not defined at user provided variables`
    );
  }
  return oDest.url;
}

function setPropAnnotations(mMetadata, aAnnotations) {
  let aEntityTypes = [];

  try {
    aEntityTypes =
      mMetadata["edmx:Edmx"]["edmx:DataServices"]["Schema"]["EntityType"];
  } catch (e) {
    throw new Error("Error while parsing metadata entity type path");
  }

  for (let i = 0; i < aAnnotations.length; i++) {
    let { entity_type, property, annotations } = aAnnotations[i];

    let oEntity = aEntityTypes.filter(type => type.Name === entity_type)[0];
    if (!oEntity) {
      console.log(`Entity ${oEntity.Name} not found!`);
      continue;
    }

    let oProperty = oEntity.Property.filter(prop => prop.Name === property)[0];
    if (!oProperty) {
      console.log(
        `Property ${property} of EntityType ${entity_type} not found!`
      );
      continue;
    }

    for (let j = 0; j < annotations.length; j++) {
      const { name, value } = annotations[j];
      if (name && !(name in ENITITY_TYPE_WHITE_LIST)) {
        console.log(`Annotation ${name} not valid for properties!`);
        continue;
      }
      if (name && value) {
        oProperty["sap:" + name] = value;
      }
    }
  }
}

async function fillMetadata(sPath, property_annotations) {
  return await request(sPath, (err, resp, body) => {
    const valid = parser.validate(body);

    if (!valid) {
      throw new Error("Metadata body is invalid");
    }

    const opts = {
      attributeNamePrefix: "",
      ignoreAttributes: false
    };

    let mMetadata = parser.parse(body, opts);
    setPropAnnotations(mMetadata, property_annotations);
    const reparser = new Parser(opts);
    metadata = reparser.parse(mMetadata);
  });
}

function metadataMiddleware({
  service_name,
  destination_name,
  property_annotations
}) {
  const sBaseUrl = getOdataUrl(destination_name);
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

  return (req, res) => {
    const sPath =
      sBaseUrl + "/" + service_name + req.originalUrl.replace("/odata", "");
    if (sPath.indexOf("$metadata") > -1) {
      if (!metadata) {
        (async () => {
          await fillMetadata(sPath, property_annotations);
        })();
      }
      res.type("application/xml;charset=utf-8").send(metadata);
    } else {
      req.pipe(request(sPath)).pipe(res);
    }
  };
}

module.exports = metadataMiddleware;
