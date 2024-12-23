<?php
require 'vendor/autoload.php';

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use React\EventLoop\Factory;
use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class AudioServer implements MessageComponentInterface
{
    protected $clients;
    protected $userIds;
    protected $activeParticipants;
    protected $pendingConnections;

    public function __construct()
    {
        $this->clients = new \SplObjectStorage;
        $this->userIds = [];
        $this->activeParticipants = new \SplObjectStorage;
        $this->pendingConnections = new \SplObjectStorage;
        echo "Serveur de signalisation WebRTC démarré!\n";
    }

    public function onOpen(ConnectionInterface $conn)
    {
        // Ajouter à la liste des connexions en attente
        $this->pendingConnections->attach($conn);
        echo "Nouvelle connexion en attente de configuration...\n";
    }

    public function onMessage(ConnectionInterface $from, $msg)
    {
        $data = json_decode($msg);

        switch ($data->type) {
            case 'set-user-id':
                $this->handleSetUserId($from, $data->userId);
                break;

            case 'participant-pret':
                if (isset($this->userIds[$from->resourceId])) {
                    $fromUserId = $this->userIds[$from->resourceId];
                    // Ajout aux participants actifs
                    $this->activeParticipants->attach($from);

                    // Notification aux autres clients
                    foreach ($this->clients as $client) {
                        if ($client !== $from) {
                            $client->send(json_encode([
                                'type' => 'nouveau-participant',
                                'userId' => $fromUserId
                            ]));
                        }
                    }
                }
                break;

            default:
                if (isset($this->userIds[$from->resourceId])) {
                    $fromUserId = $this->userIds[$from->resourceId];
                    // Ajout de l'ID de l'expéditeur au message
                    $data->userId = $fromUserId;

                    // Transmission du message au destinataire spécifique
                    if (isset($data->targetUserId)) {
                        foreach ($this->clients as $client) {
                            if ($this->userIds[$client->resourceId] === $data->targetUserId) {
                                $client->send(json_encode($data));
                                break;
                            }
                        }
                    }
                }
        }
    }

    protected function handleSetUserId(ConnectionInterface $conn, $userId)
    {
        // Vérifier si l'ID est déjà utilisé
        if (in_array($userId, $this->userIds)) {
            $conn->send(json_encode([
                'type' => 'id-error',
                'message' => 'Cet identifiant est déjà utilisé'
            ]));
            return;
        }

        // Retirer de la liste des connexions en attente
        $this->pendingConnections->detach($conn);

        // Ajouter aux clients actifs
        $this->clients->attach($conn);
        $this->userIds[$conn->resourceId] = $userId;

        // Confirmer l'ID
        $conn->send(json_encode([
            'type' => 'id-confirmed'
        ]));

        // Envoyer la liste actuelle des participants actifs
        $participantsList = [];
        foreach ($this->activeParticipants as $client) {
            $participantsList[] = $this->userIds[$client->resourceId];
        }
        $conn->send(json_encode([
            'type' => 'liste-participants',
            'participants' => $participantsList
        ]));

        echo "Utilisateur configuré avec ID: {$userId}\n";
    }

    public function onClose(ConnectionInterface $conn)
    {
        // Vérifier si c'était une connexion configurée
        if (isset($this->userIds[$conn->resourceId])) {
            $userId = $this->userIds[$conn->resourceId];

            // Notification aux autres clients que le participant est parti
            foreach ($this->clients as $client) {
                if ($client !== $conn) {
                    $client->send(json_encode([
                        'type' => 'participant-deconnecte',
                        'userId' => $userId
                    ]));
                }
            }

            // Nettoyage
            $this->clients->detach($conn);
            $this->activeParticipants->detach($conn);
            unset($this->userIds[$conn->resourceId]);
            echo "Connexion {$userId} fermée\n";
        } else {
            // Nettoyage des connexions en attente
            $this->pendingConnections->detach($conn);
            echo "Connexion en attente fermée\n";
        }
    }

    public function onError(ConnectionInterface $conn, \Exception $e)
    {
        echo "Une erreur est survenue: {$e->getMessage()}\n";
        $conn->close();
    }
}

// Configuration du serveur
$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new AudioServer()
        )
    ),
    8080
);

$server->run();
