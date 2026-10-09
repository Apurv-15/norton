import Foundation
import EndpointSecurity

let EXTENSION_VERSION = "1.0.0"
let EXTENSION_BUNDLE_ID = "com.norton.norton260.security"
let NORTON_APP_BUNDLE_PREFIX = "com.norton.norton260"

class EndpointSecurityManager {
    static let shared = EndpointSecurityManager()
    
    private var esClient: OpaquePointer?
    private(set) var isConnected = false
    private(set) var isAuthorized = false
    
    func initialize() -> Bool {
        print("[NortonSecurityExtension] Initializing Endpoint Security Client...")
        
        var client: OpaquePointer?
        let res = es_new_client(&client) { [weak self] client, message in
            self?.handleMessage(message)
        }
        
        switch res {
        case ES_NEW_CLIENT_RESULT_SUCCESS:
            esClient = client
            isConnected = true
            isAuthorized = true
            print("[NortonSecurityExtension] Endpoint Security client successfully connected")
            subscribeEvents()
            return true
            
        case ES_NEW_CLIENT_RESULT_ERR_NOT_ENTITLED:
            print("[NortonSecurityExtension] Error: Missing com.apple.developer.endpoint-security.client entitlement")
            isAuthorized = false
            return false
            
        case ES_NEW_CLIENT_RESULT_ERR_NOT_PERMITTED:
            print("[NortonSecurityExtension] Error: Endpoint Security permission not approved by user/system")
            isAuthorized = false
            return false
            
        default:
            print("[NortonSecurityExtension] Endpoint Security client creation returned code: \(res.rawValue)")
            return false
        }
    }
    
    private func subscribeEvents() {
        guard let client = esClient else { return }
        let events: [es_event_type_t] = [
            ES_EVENT_TYPE_AUTH_SIGNAL,
            ES_EVENT_TYPE_NOTIFY_EXEC,
            ES_EVENT_TYPE_NOTIFY_EXIT
        ]
        
        events.withUnsafeBufferPointer { ptr in
            if let base = ptr.baseAddress {
                let subResult = es_subscribe(client, base, UInt32(events.count))
                print("[NortonSecurityExtension] ES Subscription status for AUTH_SIGNAL & NOTIFY_EXEC: \(subResult.rawValue)")
            }
        }
    }
    
    private func handleMessage(_ msg: UnsafePointer<es_message_t>) {
        let eventType = msg.pointee.event_type
        
        switch eventType {
        case ES_EVENT_TYPE_AUTH_SIGNAL:
            handleAuthSignal(msg)
            
        default:
            let pid = msg.pointee.process.pointee.audit_token.val.5
            print("[NortonSecurityExtension] [ES Event \(eventType.rawValue)] Process PID: \(pid)")
        }
    }
    
    private func handleAuthSignal(_ msg: UnsafePointer<es_message_t>) {
        guard let client = esClient else { return }
        
        let instigator = msg.pointee.process.pointee
        let instigatorPid = instigator.audit_token.val.5
        let signal = msg.pointee.event.signal.sig
        
        let targetProcess = msg.pointee.event.signal.target.pointee
        let targetPid = targetProcess.audit_token.val.5
        
        // Extract signing / identity metadata using Endpoint Security audit structure
        var targetSigningID = ""
        if let teamIDPtr = targetProcess.team_id.data {
            let teamStr = String(cString: teamIDPtr)
            targetSigningID += "Team: \(teamStr) "
        }
        if let signingIDPtr = targetProcess.signing_id.data {
            let signStr = String(cString: signingIDPtr)
            targetSigningID += "ID: \(signStr)"
        }
        
        var instigatorSigningID = ""
        if let instSigningPtr = instigator.signing_id.data {
            instigatorSigningID = String(cString: instSigningPtr)
        }
        
        let isTargetNortonComponent = targetSigningID.contains(NORTON_APP_BUNDLE_PREFIX) || targetSigningID.contains("Norton")
        let isInstigatorNortonComponent = instigatorSigningID.contains(NORTON_APP_BUNDLE_PREFIX) || instigatorSigningID.contains("Norton")
        
        if isTargetNortonComponent {
            if isInstigatorNortonComponent || instigatorPid == targetPid {
                print("[NortonSecurityExtension] AUTH_SIGNAL Allowed: Trusted Norton lifecycle operation (Sig: \(signal), Instigator: \(instigatorPid) -> Target: \(targetPid))")
                es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW, false)
            } else {
                print("[NortonSecurityExtension] AUTH_SIGNAL Denied: Self-protection policy blocked unauthorized signal (Sig: \(signal), Instigator PID \(instigatorPid) [\(instigatorSigningID)] -> Target PID \(targetPid) [\(targetSigningID)])")
                es_respond_auth_result(client, msg, ES_AUTH_RESULT_DENY, false)
            }
        } else {
            // Signal targeting non-Norton process: Allow standard OS signal
            es_respond_auth_result(client, msg, ES_AUTH_RESULT_ALLOW, false)
        }
    }
    
    func shutdown() {
        if let client = esClient {
            es_unsubscribe_all(client)
            es_delete_client(client)
            esClient = nil
        }
        isConnected = false
    }
}
