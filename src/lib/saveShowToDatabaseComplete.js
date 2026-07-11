import { saveShowToDatabase } from "./saveShowToDatabase";
import { refreshShowData } from "./refreshShowData";

export async function saveShowToDatabaseComplete(show) {
  const savedShow = await saveShowToDatabase(show);

  try {
    await refreshShowData(savedShow);
  } catch (error) {
    console.error("Complete episode sync failed after saving show:", error);
  }

  return savedShow;
}
