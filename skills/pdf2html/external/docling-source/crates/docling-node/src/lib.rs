// Skill-owned PDF binding to the MIT-licensed Docling.rs 1.32.0 pipeline.
use napi::{bindgen_prelude::AsyncTask, Env, Error, Result, Status, Task};
use napi_derive::napi;
use std::{fs, path::Path};

#[napi(object)]
pub struct ConvertOptions {
    pub to: Option<String>,
    pub skip_ocr: Option<bool>,
    pub no_text_panels: Option<bool>,
    pub pipeline: Option<String>,
}

#[napi(object)]
pub struct ConvertResult {
    pub content: String,
}

#[napi]
pub fn supported_formats() -> Vec<String> {
    vec!["pdf".to_string()]
}

#[napi(ts_return_type = "Promise<ConvertResult>")]
pub fn convert_file_async(path: String, options: ConvertOptions) -> Result<AsyncTask<ConvertFileTask>> {
    if options.to.as_deref() != Some("json") || options.skip_ocr != Some(true)
        || options.no_text_panels != Some(true) || options.pipeline.as_deref() != Some("standard") {
        return Err(Error::new(Status::InvalidArg, "Expected the skill's PDF JSON options."));
    }
    if !Path::new(&path).extension().is_some_and(|value| value.eq_ignore_ascii_case("pdf")) {
        return Err(Error::new(Status::InvalidArg, "Expected a PDF file."));
    }
    Ok(AsyncTask::new(ConvertFileTask { path }))
}

pub struct ConvertFileTask { path: String }
impl Task for ConvertFileTask {
    type Output = String;
    type JsValue = ConvertResult;

    fn compute(&mut self) -> Result<String> {
        let fail = |error: String| Error::new(Status::GenericFailure, error);
        let bytes = fs::read(&self.path).map_err(|error| fail(error.to_string()))?;
        let name = Path::new(&self.path).file_stem().unwrap_or_default().to_string_lossy();
        let mut pipeline = docling_pdf::Pipeline::new().map_err(|error| fail(error.to_string()))?
            .skip_ocr(true).no_text_panels(true)
            .heading_hierarchy(docling_pdf::HeadingHierarchyOptions::enabled(false));
        let document = pipeline.convert(&bytes, None, &name).map_err(|error| fail(error.to_string()))?;
        Ok(document.export_to_json())
    }

    fn resolve(&mut self, _env: Env, content: String) -> Result<ConvertResult> {
        Ok(ConvertResult { content })
    }
}
