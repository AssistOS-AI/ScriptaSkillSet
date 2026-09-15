// A rejected combined candidate must not starve independent source repairs.
// Each attempt starts from canonical bytes; the caller installs at most one
// accepted batch before collecting fresh selectors/evidence in the next pass.
export async function tryCorrectionBatches(batches, attempt, rejected) {
  for(const batch of batches){
    try{if(await attempt(batch))return batch.name;}
    catch(error){
      if(!error.findings&&!/^CSS consolidation changed computed /.test(error.message))throw error;
      await rejected(batch,error);
    }
  }
  return null;
}
