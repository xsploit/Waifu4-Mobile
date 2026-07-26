package ai.webwaifu.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import ai.webwaifu.mobile.data.LocalTransferImporter
import ai.webwaifu.mobile.ui.WebWaifuApp
import ai.webwaifu.mobile.ui.theme.WebWaifuTheme
import java.io.File

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        importPendingLocalTransfer()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent {
            WebWaifuTheme {
                val viewModel: WaifuViewModel = viewModel()
                WebWaifuApp(viewModel)
            }
        }
    }

    private fun importPendingLocalTransfer() {
        val pending = File(filesDir, LocalTransferImporter.PENDING_BACKUP_FILE)
        if (!pending.isFile) return
        try {
            runCatching { LocalTransferImporter(this).import(pending.readText()) }
        } finally {
            pending.delete()
        }
    }
}
