# -*- coding: utf-8 -*-
"""Acrescenta 24 textos corridos (6 por faixa) ao banco DISCOURSE de app/app.js.

Regras:
- options[0] é sempre a resposta correta (o app embaralha na hora de mostrar);
- 4 perguntas por texto, 4 opções distintas por pergunta;
- tamanho cresce por faixa (D1 curto, D4 longo), medido em palavras;
- os textos reservados para a avaliação (d03, d04) não são tocados.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app" / "app.js"

NEW = [
    # ------------------------------------------------------------------ D1
    {
        "id": "d11", "tier": "D1", "genre": "telejornal", "domain": "cidade",
        "text": "Boa tarde. A prefeitura fechou uma faixa da Avenida Paulista para o conserto de um cano. A obra começa amanhã e deve durar cinco dias. Os ônibus vão passar pela rua de trás, e o trânsito deve ficar lento no horário de pico.",
        "questions": [
            ("main", "O que a prefeitura fechou?",
             ["Uma faixa da Avenida Paulista", "Uma escola municipal", "Um posto de saúde", "Uma estação de metrô"]),
            ("detail", "Por que a faixa foi fechada?",
             ["Para o conserto de um cano", "Para uma festa da prefeitura", "Para pintar a rua", "Para plantar árvores"]),
            ("detail", "Quanto tempo a obra deve durar?",
             ["Cinco dias", "Cinco meses", "Um dia", "Duas semanas"]),
            ("infer", "O que deve acontecer com o trânsito?",
             ["Vai ficar lento no horário de pico", "Vai melhorar na hora", "Vai parar de vez", "Não vai mudar"]),
        ],
    },
    {
        "id": "d12", "tier": "D1", "genre": "esporte", "domain": "esporte",
        "text": "O São Paulo abre os portões amanhã para um treino aberto à torcida. A entrada é gratuita, mas cada pessoa pode levar um quilo de alimento. O time joga no domingo, às quatro da tarde, e o técnico deve poupar dois titulares.",
        "questions": [
            ("main", "O que o São Paulo vai fazer amanhã?",
             ["Um treino aberto à torcida", "Uma festa no Morumbi", "Um jogo contra o Corinthians", "Uma entrevista coletiva"]),
            ("detail", "O que cada pessoa pode levar?",
             ["Um quilo de alimento", "Uma camisa do time", "Um ingresso pago", "Um documento com foto"]),
            ("detail", "Quando o time joga?",
             ["Domingo, às quatro da tarde", "Sábado de manhã", "Segunda à noite", "Quinta ao meio-dia"]),
            ("infer", "O que o técnico deve fazer com dois titulares?",
             ["Poupar", "Vender", "Escalar no gol", "Dar entrevista no intervalo"]),
        ],
    },
    {
        "id": "d13", "tier": "D1", "genre": "telejornal", "domain": "tecnologia",
        "text": "O banco lançou um assistente novo no aplicativo. Agora o cliente pode perguntar por voz o saldo e o horário do pagamento. O banco avisou que o assistente não pede senha nem dados do cartão por mensagem. Quem tiver dúvida deve procurar a agência.",
        "questions": [
            ("main", "O que o banco lançou?",
             ["Um assistente no aplicativo", "Um cartão novo", "Uma agência nova", "Um tipo de empréstimo"]),
            ("detail", "O que o cliente pode perguntar por voz?",
             ["O saldo e o horário do pagamento", "A senha do cartão", "O endereço da agência", "O nome do gerente"]),
            ("negative", "O que o assistente NÃO pede por mensagem?",
             ["Senha e dados do cartão", "O nome do cliente", "O número da conta", "A data de hoje"]),
            ("action", "O que fazer em caso de dúvida?",
             ["Procurar a agência", "Mandar a senha por mensagem", "Ligar para o vizinho", "Apagar o aplicativo"]),
        ],
    },
    {
        "id": "d14", "tier": "D1", "genre": "entrevista", "domain": "saude",
        "text": "A repórter perguntou ao farmacêutico do bairro sobre a entrega de remédios em casa. Ele explicou que o serviço vale para quem tem mais de sessenta anos e mora até dois quilômetros da loja. Pediu que o pedido seja feito até as três da tarde.",
        "questions": [
            ("main", "Sobre o que o farmacêutico falou?",
             ["Sobre a entrega de remédios em casa", "Sobre o preço dos remédios", "Sobre a reforma da loja", "Sobre a vacina da gripe"]),
            ("detail", "Quem tem direito à entrega?",
             ["Quem tem mais de sessenta anos e mora perto", "Só quem tem plano de saúde", "Qualquer pessoa de qualquer bairro", "Somente crianças"]),
            ("detail", "Até que horas o pedido pode ser feito?",
             ["Até as três da tarde", "Até as nove da noite", "Até o meio-dia", "Até as sete da manhã"]),
            ("infer", "Até que distância a loja entrega?",
             ["Dois quilômetros", "Vinte quilômetros", "Cem metros", "A cidade inteira"]),
        ],
    },
    {
        "id": "d15", "tier": "D1", "genre": "jornal", "domain": "dinheiro",
        "text": "O aposentado que recebe pelo banco precisa fazer a prova de vida todo ano. Neste mês, o atendimento é das nove da manhã às quatro da tarde, sem precisar marcar hora. Quem tem dificuldade para andar pode pedir a visita do banco em casa.",
        "questions": [
            ("main", "O que o aposentado precisa fazer?",
             ["A prova de vida", "Um cadastro novo", "A troca do cartão", "A matrícula no posto"]),
            ("detail", "Qual é o horário do atendimento?",
             ["Das nove da manhã às quatro da tarde", "Das seis às dez da manhã", "Só pela manhã", "Das oito da noite à meia-noite"]),
            ("negative", "O que NÃO é preciso para ser atendido?",
             ["Marcar hora", "Ir ao banco", "Levar documento", "Ir durante o dia"]),
            ("action", "O que pode fazer quem tem dificuldade para andar?",
             ["Pedir a visita do banco em casa", "Esperar o ano que vem", "Mandar um parente sem documento", "Pedir a um vizinho para assinar"]),
        ],
    },
    {
        "id": "d16", "tier": "D1", "genre": "entrevista", "domain": "cidade",
        "text": "A feirante contou que a feira do bairro mudou de lugar por causa da obra na praça. Agora as barracas ficam na rua de trás, ao lado da escola. Ela disse que as vendas caíram no primeiro dia, mas que já estão melhorando.",
        "questions": [
            ("main", "O que mudou na feira?",
             ["O lugar das barracas", "O dia da feira", "O preço das frutas", "O horário de abertura"]),
            ("detail", "Por que a feira mudou de lugar?",
             ["Por causa da obra na praça", "Por causa da chuva", "Por causa da escola", "Por falta de clientes"]),
            ("detail", "Onde as barracas ficam agora?",
             ["Na rua de trás, ao lado da escola", "Dentro da escola", "Na praça", "No mercado municipal"]),
            ("infer", "O que ela disse sobre as vendas?",
             ["Caíram no começo e já estão melhorando", "Nunca mudaram", "Só pioraram", "Ficaram iguais"]),
        ],
    },
    # ------------------------------------------------------------------ D2
    {
        "id": "d17", "tier": "D2", "genre": "telejornal", "domain": "cidade",
        "text": "A companhia de água avisou que o abastecimento vai ficar mais fraco na próxima quarta-feira, das oito da manhã às seis da tarde, em cinco bairros da zona leste. O motivo é a troca de uma bomba antiga. A companhia pediu que os moradores guardem água em recipientes limpos e evitem lavar roupa nesse dia. Quem tem caixa d'água não deve sentir a falta. Em caso de falta total, a orientação é ligar para o número que aparece na conta.",
        "questions": [
            ("main", "O que vai acontecer na quarta-feira?",
             ["O abastecimento vai ficar mais fraco", "A água vai acabar de vez", "A conta vai subir", "O bairro vai ficar sem energia"]),
            ("detail", "Quantos bairros serão afetados?",
             ["Cinco bairros", "Dois bairros", "Cinquenta bairros", "Todos os bairros"]),
            ("detail", "Qual é o motivo do corte?",
             ["A troca de uma bomba antiga", "Uma obra no metrô", "A falta de chuva", "Um vazamento na rua"]),
            ("action", "O que fazer se faltar água de vez?",
             ["Ligar para o número que aparece na conta", "Ir até a prefeitura", "Comprar água de caminhão", "Esperar sem fazer nada"]),
        ],
    },
    {
        "id": "d18", "tier": "D2", "genre": "entrevista", "domain": "saude",
        "text": "A repórter conversou com a coordenadora da campanha de doação de sangue do hospital. Ela explicou que o estoque está baixo desde o feriado e que qualquer pessoa entre dezesseis e sessenta e nove anos pode doar. É preciso estar bem de saúde e ter mais de cinquenta quilos. A doação leva cerca de quarenta minutos. O hospital atende de segunda a sábado, das sete às cinco. Ela pediu que os doadores tomem água antes e evitem fumar por duas horas.",
        "questions": [
            ("main", "O que a campanha está pedindo?",
             ["Doação de sangue", "Doação de roupas", "Doação de remédios", "Doação de alimentos"]),
            ("detail", "Qual é a idade mínima para doar?",
             ["Dezesseis anos", "Vinte e um anos", "Sessenta e nove anos", "Doze anos"]),
            ("detail", "Quanto tempo leva a doação?",
             ["Cerca de quarenta minutos", "Cerca de duas horas", "Cinco minutos", "O dia inteiro"]),
            ("action", "O que ela pediu aos doadores?",
             ["Tomar água antes e não fumar por duas horas", "Ir em jejum total", "Não tomar água", "Levar a receita do médico"]),
        ],
    },
    {
        "id": "d19", "tier": "D2", "genre": "esporte", "domain": "esporte",
        "text": "O São Paulo venceu o jogo de quarta por um a zero, com gol nos minutos finais. O time jogou com um jogador menos desde a metade do segundo tempo, depois da expulsão do zagueiro. O goleiro fez duas boas defesas e foi escolhido o melhor da partida. Com o resultado, o time subiu para a quarta posição. O próximo jogo é no sábado, fora de casa, contra um time que luta para não cair.",
        "questions": [
            ("main", "Qual foi o resultado do jogo?",
             ["São Paulo 1 a 0", "Empate em zero a zero", "São Paulo 0 a 1", "São Paulo 2 a 1"]),
            ("detail", "Por que o time ficou com um jogador menos?",
             ["Pela expulsão do zagueiro", "Por lesão do goleiro", "Pelo cartão do técnico", "Por escolha do treinador"]),
            ("detail", "Quem foi o melhor da partida?",
             ["O goleiro", "O zagueiro", "O técnico", "O árbitro"]),
            ("order", "Onde é o próximo jogo?",
             ["Fora de casa, no sábado", "No Morumbi, na quarta", "Fora de casa, no domingo", "No Pacaembu, hoje"]),
        ],
    },
    {
        "id": "d20", "tier": "D2", "genre": "jornal", "domain": "dinheiro",
        "text": "O preço do gás de cozinha subiu três reais no estado e passou a ser vendido, em média, a cento e dez reais. A alta vale a partir de hoje e já aparece nas revendas. O sindicato dos revendedores disse que a procura caiu nas últimas semanas e que muita gente está trocando o botijão por um menor. Famílias de baixa renda podem procurar o cadastro social no posto do bairro. O governo avisou que o auxílio continua igual neste mês.",
        "questions": [
            ("main", "O que aconteceu com o gás de cozinha?",
             ["O preço subiu três reais", "O preço caiu", "Ficou mais leve", "Sumiu das revendas"]),
            ("detail", "Qual é o preço médio do botijão?",
             ["Cento e dez reais", "Cem reais", "Trezentos reais", "Cinquenta reais"]),
            ("detail", "O que muita gente está fazendo?",
             ["Trocando por um botijão menor", "Deixando de cozinhar", "Comprando dois botijões", "Voltando ao fogão a lenha"]),
            ("infer", "O que o governo avisou sobre o auxílio?",
             ["Continua igual neste mês", "Vai dobrar", "Foi cancelado", "Só vale para o gás"]),
        ],
    },
    {
        "id": "d21", "tier": "D2", "genre": "telejornal", "domain": "tecnologia",
        "text": "Uma empresa de transporte começou a usar inteligência artificial para prever atrasos nos ônibus. O sistema olha o movimento das ruas e avisa o passageiro pelo aplicativo com dez minutos de antecedência. A empresa disse que o aviso vale, por enquanto, em quinze linhas da zona sul. Os motoristas participaram dos testes e pediram que o aplicativo não fosse usado para vigiar o trabalho deles. A empresa prometeu não guardar a localização depois da viagem e explicou que o sistema é uma estimativa.",
        "questions": [
            ("main", "Para que a empresa usa a inteligência artificial?",
             ["Para prever atrasos nos ônibus", "Para vender passagens", "Para trocar motoristas", "Para pintar os ônibus"]),
            ("detail", "Em quantas linhas o sistema funciona por enquanto?",
             ["Quinze linhas", "Cinquenta linhas", "Duas linhas", "Todas as linhas"]),
            ("detail", "Com quantos minutos de antecedência chega o aviso?",
             ["Dez minutos", "Uma hora", "Dois minutos", "Meia hora"]),
            ("infer", "O que os motoristas pediram?",
             ["Que o aplicativo não sirva para vigiar o trabalho", "Que o sistema seja desligado", "Que os ônibus sejam novos", "Que o aviso chegue por carta"]),
        ],
    },
    {
        "id": "d22", "tier": "D2", "genre": "telejornal", "domain": "cidade",
        "text": "As aulas da escola estadual do bairro voltam na segunda-feira, depois de dois meses de reforma. O telhado foi trocado e as salas ganharam ventiladores novos. A obra atrasou por causa da chuva. A diretora explicou que os alunos serão divididos em dois turnos por quinze dias, até a pintura terminar. Os pais foram avisados por mensagem e a lista dos horários está no portão da escola. O material que ficou guardado foi devolvido aos alunos na sexta-feira.",
        "questions": [
            ("main", "O que acontece na segunda-feira?",
             ["As aulas voltam", "A escola fecha", "Começa a pintura", "Os pais se reúnem"]),
            ("detail", "O que foi trocado na reforma?",
             ["O telhado", "O piso da quadra", "Os computadores", "A cerca"]),
            ("detail", "Por que a obra atrasou?",
             ["Por causa da chuva", "Por falta de verba", "Por causa dos pais", "Por falta de alunos"]),
            ("order", "Por quanto tempo os alunos ficam em dois turnos?",
             ["Quinze dias", "Dois meses", "Uma semana", "Um ano"]),
        ],
    },
    # ------------------------------------------------------------------ D3
    {
        "id": "d23", "tier": "D3", "genre": "telejornal", "domain": "cidade",
        "text": "A prefeitura apresentou nesta manhã um plano para reduzir os alagamentos na zona oeste. O plano prevê a construção de três piscinões e a limpeza de vinte e dois córregos até o fim do ano que vem. O custo estimado é de cento e oitenta milhões de reais, e a verba já está no orçamento. Moradores de duas ruas que alagam todo verão reclamaram que a obra começa só em março e pediram uma solução para a próxima temporada de chuva. A secretaria respondeu que vai instalar bombas provisórias em dois pontos até dezembro. Especialistas ouvidos pela reportagem dizem que o plano ajuda, mas que nenhuma obra resolve tudo sem mudar a ocupação das margens do córrego.",
        "questions": [
            ("main", "O que a prefeitura apresentou?",
             ["Um plano para reduzir alagamentos", "Um aumento de imposto", "Um projeto de metrô", "Um hospital novo"]),
            ("detail", "Quantos córregos serão limpos?",
             ["Vinte e dois", "Três", "Dois", "Cento e oitenta"]),
            ("detail", "Quando a obra começa?",
             ["Em março", "Em dezembro", "Na semana que vem", "No ano passado"]),
            ("infer", "O que os especialistas disseram?",
             ["O plano ajuda, mas não resolve tudo sozinho", "O plano não serve para nada", "A obra deve acabar em um mês", "O problema não existe"]),
        ],
    },
    {
        "id": "d24", "tier": "D3", "genre": "entrevista", "domain": "transporte",
        "text": "A repórter entrevistou um pesquisador de mobilidade urbana sobre a faixa exclusiva de ônibus inaugurada há um mês na avenida. Ele explicou que a velocidade média dos ônibus no horário de pico subiu de doze para dezenove quilômetros por hora. Contou que o tempo de viagem caiu cerca de oito minutos no trecho mais movimentado. Sobre as reclamações dos motoristas, respondeu que o primeiro mês sempre tem ajuste e que o número de carros na via praticamente não mudou. Perguntado sobre o custo, informou que a implantação saiu por quatro milhões de reais. No fim, recomendou ampliar o horário de funcionamento da faixa para os fins de semana.",
        "questions": [
            ("main", "Sobre o que o pesquisador falou?",
             ["Sobre a faixa exclusiva de ônibus", "Sobre o preço da gasolina", "Sobre a reforma da avenida", "Sobre o metrô novo"]),
            ("detail", "De quanto para quanto subiu a velocidade dos ônibus?",
             ["De doze para dezenove quilômetros por hora", "De dezenove para doze", "De oito para dez", "De trinta para quarenta"]),
            ("detail", "Quanto custou a implantação?",
             ["Quatro milhões de reais", "Oito mil reais", "Doze milhões de reais", "Quarenta mil reais"]),
            ("infer", "O que ele recomendou no fim?",
             ["Ampliar o horário da faixa nos fins de semana", "Acabar com a faixa", "Aumentar a passagem", "Tirar os ônibus da avenida"]),
        ],
    },
    {
        "id": "d25", "tier": "D3", "genre": "esporte", "domain": "esporte",
        "text": "Em entrevista coletiva nesta tarde, o presidente do São Paulo fez um balanço do semestre. Ele informou que o clube fechou as contas com superávit de doze milhões de reais, puxado pela venda de um jogador e pelo aumento do número de sócios. Sobre contratações, disse que dois reforços chegam em janeiro e que o time não vai gastar mais do que arrecada. Perguntado sobre a reforma do estádio, respondeu que a obra está na fase de projeto e que nada começa antes de 2027. O presidente também comentou a campanha no campeonato: lembrou que o time está a cinco pontos do líder e que faltam nove rodadas. No fim, pediu paciência à torcida.",
        "questions": [
            ("main", "O que o presidente apresentou?",
             ["Um balanço do semestre", "A lista de jogadores demitidos", "O escudo novo do clube", "A tabela do campeonato"]),
            ("detail", "Qual foi o superávit do clube?",
             ["Doze milhões de reais", "Dois milhões de reais", "Cem mil reais", "Nove milhões de reais"]),
            ("order", "Quando a obra do estádio deve começar?",
             ["Só depois de 2027", "Em janeiro", "Na próxima semana", "No fim deste ano"]),
            ("infer", "A quantos pontos do líder o time está?",
             ["Cinco pontos", "Doze pontos", "Nove pontos", "Dois pontos"]),
        ],
    },
    {
        "id": "d26", "tier": "D3", "genre": "jornal", "domain": "dinheiro",
        "text": "O reajuste dos aluguéis residenciais acumulou alta de nove por cento nos últimos doze meses, segundo o índice mais usado nos contratos. O número supera a inflação do período e preocupa inquilinos de bairros centrais. Advogados explicam que o aumento só pode ser aplicado uma vez por ano e sempre pelo índice escrito no contrato. Quem tem contrato antigo, anterior a 2019, pode ter regras diferentes e deve procurar orientação antes de aceitar o valor. Nos casos de atraso no pagamento, o locatário tem direito a aviso e prazo antes de qualquer ação mais dura. A associação dos inquilinos recomenda guardar os recibos e negociar por escrito, porque acordo só de palavra costuma virar conflito.",
        "questions": [
            ("main", "O que a matéria trata?",
             ["O reajuste dos aluguéis", "A compra da casa própria", "A falta de imóveis", "O imposto de renda"]),
            ("detail", "Quanto os aluguéis subiram em doze meses?",
             ["Nove por cento", "Doze por cento", "Dezenove por cento", "Um por cento"]),
            ("detail", "Quantas vezes por ano o reajuste pode ser aplicado?",
             ["Uma vez", "Duas vezes", "A cada mês", "Quatro vezes"]),
            ("action", "O que a associação recomenda?",
             ["Guardar recibos e negociar por escrito", "Sair do imóvel sem avisar", "Pagar só metade", "Ignorar o contrato"]),
        ],
    },
    {
        "id": "d27", "tier": "D3", "genre": "telejornal", "domain": "tecnologia",
        "text": "Três escolas municipais começaram a usar um programa de inteligência artificial para ajudar os professores a corrigir redações. O programa aponta erros de concordância e sugere comentários, mas a nota final continua sendo do professor. A secretaria de educação explicou que a ferramenta foi testada por dois meses com quarenta professores e que o uso é opcional. Sobre a privacidade, informou que os textos não saem do sistema da escola e que nenhum dado dos alunos é vendido. Alguns professores contaram que a correção ficou mais rápida e que sobra mais tempo para conversar com os alunos. Outros pediram formação antes de usar o programa. A secretaria prometeu treinamento no começo do próximo semestre.",
        "questions": [
            ("main", "O que as escolas começaram a usar?",
             ["Um programa de inteligência artificial para corrigir redações", "Um aplicativo de jogos", "Um sistema de câmeras", "Uma plataforma de vídeo"]),
            ("detail", "Quem dá a nota final da redação?",
             ["O professor", "O programa", "A secretaria", "O aluno"]),
            ("detail", "Quantos professores testaram a ferramenta?",
             ["Quarenta", "Quatro", "Duzentos", "Doze"]),
            ("infer", "O que alguns professores pediram?",
             ["Formação antes de usar o programa", "Que o programa desse as notas", "Que o projeto acabasse", "Que os alunos não escrevessem"]),
        ],
    },
    {
        "id": "d28", "tier": "D3", "genre": "entrevista", "domain": "saude",
        "text": "A repórter conversou com o agente de endemias que coordena o combate ao mosquito no bairro. Ele explicou que a equipe visita cerca de mil casas por mês e que a maior parte dos criadouros está em quintais, em pratos de vaso e caixas d'água destampadas. Contou que o trabalho é mais difícil nos terrenos vazios e pediu que os moradores permitam a entrada dos agentes, que andam uniformizados e com crachá. Sobre os casos, informou que o bairro registrou doze suspeitas neste mês, metade do número do ano passado. Disse também que o repelente ajuda, mas não substitui a limpeza dos quintais. No fim, lembrou que a água parada deve ser jogada fora uma vez por semana.",
        "questions": [
            ("main", "Sobre o que o agente falou?",
             ["Sobre o combate ao mosquito no bairro", "Sobre a vacina da gripe", "Sobre a coleta de lixo", "Sobre a obra da escola"]),
            ("detail", "Onde está a maior parte dos criadouros?",
             ["Em quintais, em pratos de vaso e caixas destampadas", "Nas ruas asfaltadas", "Nas escolas", "Nos rios"]),
            ("detail", "Quantas suspeitas o bairro registrou neste mês?",
             ["Doze", "Mil", "Seis", "Vinte"]),
            ("action", "O que ele lembrou no fim?",
             ["Jogar fora a água parada uma vez por semana", "Comprar repelente todos os dias", "Fechar as janelas de casa", "Ligar para o hospital"]),
        ],
    },
    # ------------------------------------------------------------------ D4
    {
        "id": "d29", "tier": "D4", "genre": "telejornal", "domain": "cidade",
        "text": "A prefeitura anunciou nesta manhã o pacote de obras viárias para a zona norte, com prazo de dois anos e orçamento de trezentos e vinte milhões de reais. O projeto inclui a duplicação de uma avenida, a construção de um viaduto e a troca de semáforos por equipamentos ligados a um centro de controle. Segundo a secretaria de obras, a duplicação começa em janeiro e deve melhorar o acesso ao hospital da região, que hoje recebe cerca de quatro mil veículos por dia. Moradores de três ruas laterais, no entanto, temem que os carros desviem por dentro do bairro durante a obra. A associação de moradores entregou um abaixo-assinado com duas mil assinaturas pedindo estudo de desvio e redução de velocidade nas ruas residenciais. A prefeitura respondeu que vai abrir uma reunião mensal com os moradores e que o desvio será sinalizado desde o primeiro dia.",
        "questions": [
            ("main", "O que a prefeitura anunciou?",
             ["Um pacote de obras viárias", "O aumento do IPTU", "A compra de ônibus", "A reforma de escolas"]),
            ("detail", "Qual é o orçamento do pacote?",
             ["Trezentos e vinte milhões de reais", "Dois milhões de reais", "Quatro mil reais", "Doze milhões de reais"]),
            ("detail", "Quantas assinaturas tem o abaixo-assinado?",
             ["Duas mil", "Trezentas", "Quatro mil", "Vinte mil"]),
            ("infer", "Do que os moradores têm medo?",
             ["De os carros desviarem por dentro do bairro", "Do preço da obra", "Da falta de hospital", "Do barulho do viaduto à noite"]),
        ],
    },
    {
        "id": "d30", "tier": "D4", "genre": "entrevista", "domain": "esporte",
        "text": "O repórter conversou com o volante do São Paulo, que volta ao time depois de três meses parado por causa de uma lesão no joelho. O jogador contou que fez a recuperação em casa e no centro de treinamento, com sessões de manhã e de tarde, e que chegou a ficar dez dias sem tocar na bola. Disse que sentiu medo no primeiro treino com o grupo, mas que os companheiros o ajudaram a confiar no joelho de novo. Sobre a volta, explicou que o técnico combinou com ele entrar no segundo tempo e jogar no máximo trinta minutos nas primeiras partidas. Perguntado se pensa em seleção, respondeu que primeiro quer jogar bem pelo clube e que o resto é consequência. Ele também falou da rotina de cuidados, com gelo e alongamento depois de cada treino. No fim, agradeceu os fisioterapeutas e a torcida pelas mensagens.",
        "questions": [
            ("main", "Sobre o que o jogador falou?",
             ["Sobre a volta depois da lesão", "Sobre a troca de clube", "Sobre o salário", "Sobre a aposentadoria"]),
            ("detail", "Quanto tempo ele ficou parado?",
             ["Três meses", "Dez dias", "Trinta minutos", "Dois anos"]),
            ("detail", "Quanto tempo ele deve jogar nas primeiras partidas?",
             ["No máximo trinta minutos", "Os noventa minutos", "Dez minutos", "Uma hora e meia"]),
            ("infer", "O que ele disse sobre a seleção?",
             ["Primeiro quer jogar bem pelo clube", "Que já foi convocado", "Que não pensa nisso de jeito nenhum", "Que vai se aposentar"]),
        ],
    },
    {
        "id": "d31", "tier": "D4", "genre": "entrevista", "domain": "cidade",
        "text": "A moradora que preside a associação do bairro há seis anos falou com a reportagem sobre a obra do córrego. Contou que a água entrou em quinze casas na última chuva e que duas famílias ainda estão na casa de parentes. Explicou que a associação pediu à prefeitura um mapa das áreas de risco e que até hoje recebeu apenas uma lista incompleta. Disse que a maior dificuldade é convencer os vizinhos a sair quando o alerta chega, porque muitos já viram promessas que não se cumpriram. Sobre o plano novo, comentou que a obra é bem-vinda, mas que precisa vir junto com limpeza dos córregos e fiscalização das construções na beira do rio. Perguntada sobre o que espera no ano que vem, respondeu que espera não precisar mais distribuir colchão na escola. No fim, pediu que a prefeitura publique o andamento da obra todo mês.",
        "questions": [
            ("main", "Quem falou com a reportagem?",
             ["A presidente da associação de moradores", "A secretária de obras", "A diretora da escola", "A motorista do ônibus"]),
            ("detail", "Em quantas casas a água entrou?",
             ["Quinze casas", "Duas casas", "Seis casas", "Cinquenta casas"]),
            ("detail", "O que a associação organiza para avisar sobre a chuva?",
             ["Um grupo de mensagens", "Uma rádio comunitária", "Um carro de som", "Um jornal do bairro"]),
            ("infer", "Por que é difícil convencer os vizinhos a sair?",
             ["Porque muitos já viram promessas que não se cumpriram", "Porque não recebem o aviso", "Porque a escola fica longe", "Porque não gostam da associação"]),
        ],
    },
    {
        "id": "d32", "tier": "D4", "genre": "telejornal", "domain": "tecnologia",
        "text": "Um levantamento divulgado hoje mostra que as empresas da região metropolitana que usam inteligência artificial aumentaram em quatorze por cento o número de vagas no último ano. O estudo ouviu quatrocentas e cinquenta empresas de médio e grande porte e aponta que a maior parte das contratações foi para funções de atendimento, análise de dados e manutenção de máquinas. O coordenador da pesquisa explicou que, no curto prazo, o efeito observado foi de mudança de tarefa, não de demissão em massa. O sindicato dos trabalhadores discorda em parte e afirma que os call centers foram os mais afetados, com redução de postos entre os mais jovens. Especialistas lembram que os números valem para a região pesquisada e que o resultado não pode ser generalizado para todo o país. A federação das indústrias prometeu publicar um segundo levantamento em março, com recorte por escolaridade.",
        "questions": [
            ("main", "O que o levantamento mostrou?",
             ["As empresas que usam IA aumentaram as vagas", "As empresas que usam IA demitiram todo mundo", "A IA acabou com o comércio", "Ninguém usa IA na região"]),
            ("detail", "Quantas empresas foram ouvidas?",
             ["Quatrocentas e cinquenta", "Quatorze", "Quarenta e cinco", "Quatro mil"]),
            ("detail", "Quais áreas tiveram mais contratações?",
             ["Atendimento, análise de dados e manutenção", "Limpeza e segurança", "Transporte e obras", "Saúde e educação"]),
            ("infer", "O que o sindicato afirmou?",
             ["Que os call centers foram os mais afetados", "Que ninguém perdeu o emprego", "Que a IA aumentou os salários", "Que o estudo está correto em tudo"]),
        ],
    },
    {
        "id": "d33", "tier": "D4", "genre": "entrevista", "domain": "saude",
        "text": "O secretário municipal de saúde concedeu entrevista nesta manhã para falar da fila de exames na rede pública. Ele informou que a espera média para um exame de imagem caiu de noventa para quarenta e cinco dias nos últimos seis meses, depois da contratação de dois laboratórios e da abertura de um turno à noite. Segundo ele, cerca de onze mil pessoas ainda estão na fila, a maioria aguardando exames de joelho e coluna. O secretário explicou que a prioridade é definida pelo médico que pediu o exame e que casos urgentes passam na frente, mas admitiu que o agendamento por telefone ainda é lento e que muita gente perde a vaga por não conseguir ligar. Perguntado sobre o custo, respondeu que o contrato com os laboratórios é de dezessete milhões de reais por ano. No fim, prometeu um aplicativo de agendamento para o segundo semestre.",
        "questions": [
            ("main", "Sobre o que o secretário falou?",
             ["Sobre a fila de exames", "Sobre a vacinação", "Sobre o salário dos médicos", "Sobre a reforma do hospital"]),
            ("detail", "De quanto para quanto caiu a espera média?",
             ["De noventa para quarenta e cinco dias", "De quarenta e cinco para noventa dias", "De dez para cinco dias", "De um ano para seis meses"]),
            ("detail", "Quantas pessoas ainda estão na fila?",
             ["Cerca de onze mil", "Cerca de duas mil", "Cinquenta pessoas", "Cem mil"]),
            ("infer", "O que ele admitiu sobre o agendamento?",
             ["Que o sistema por telefone ainda é lento", "Que o agendamento é perfeito", "Que ninguém perde a vaga", "Que não há fila nenhuma"]),
        ],
    },
    {
        "id": "d34", "tier": "D4", "genre": "telejornal", "domain": "transporte",
        "text": "Uma greve dos motoristas de ônibus foi evitada na madrugada de hoje, depois de quase dez horas de negociação entre o sindicato e as empresas. O acordo garante reajuste de cinco por cento no salário, além de vale-refeição e a manutenção do plano de saúde. Os motoristas pediam oito por cento e ameaçavam parar às cinco da manhã, o que afetaria cerca de quatrocentas linhas e quase um milhão de passageiros. O presidente do sindicato explicou que a proposta foi aprovada em assembleia por pequena diferença e que os trabalhadores continuam insatisfeitos com a escala de folgas. As empresas disseram que o aumento cabe no orçamento porque o contrato com a prefeitura prevê reajuste anual. A prefeitura informou que a tarifa não muda neste momento.",
        "questions": [
            ("main", "O que aconteceu na madrugada?",
             ["Uma greve dos ônibus foi evitada", "Os ônibus pararam de vez", "Os motoristas foram demitidos", "A tarifa subiu"]),
            ("detail", "Qual foi o reajuste acertado?",
             ["Cinco por cento", "Oito por cento", "Dez por cento", "Dois por cento"]),
            ("detail", "Quantos passageiros seriam afetados pela greve?",
             ["Quase um milhão", "Quatrocentas pessoas", "Dez mil", "Cem pessoas"]),
            ("infer", "Sobre o que será a próxima negociação?",
             ["Sobre a escala de folgas", "Sobre o preço da passagem", "Sobre a compra de ônibus", "Sobre a aposentadoria"]),
        ],
    },
]


def js_string(value: str) -> str:
    """String JS segura, sem escapar acentos."""
    return json.dumps(value, ensure_ascii=False)


def passage_to_js(p: dict) -> str:
    qs = []
    for kind, question, options in p["questions"]:
        opts = ", ".join(js_string(o) for o in options)
        qs.append('{"kind": %s, "q": %s, "options": [%s]}' % (js_string(kind), js_string(question), opts))
    return '  { id: %s, tier: %s, genre: %s, domain: %s, text: %s, questions: [%s] },' % (
        js_string(p["id"]), js_string(p["tier"]), js_string(p["genre"]), js_string(p["domain"]),
        js_string(p["text"]), ", ".join(qs),
    )


def validate():
    ids = [p["id"] for p in NEW]
    assert len(ids) == len(set(ids)), "id duplicado"
    limits = {"D1": (30, 55), "D2": (55, 90), "D3": (90, 125), "D4": (120, 175)}
    counts = {}
    for p in NEW:
        assert p["tier"] in limits
        counts[p["tier"]] = counts.get(p["tier"], 0) + 1
        words = len(p["text"].split())
        lo, hi = limits[p["tier"]]
        assert lo <= words <= hi, (p["id"], p["tier"], words)
        assert len(p["questions"]) == 4, p["id"]
        for kind, question, options in p["questions"]:
            assert len(options) == 4, (p["id"], question)
            assert len(set(options)) == 4, (p["id"], question)
            assert options[0].strip(), (p["id"], question)
        # a resposta certa não pode aparecer literalmente no texto de outra pergunta
    print("novos por faixa:", counts)
    return counts


def main():
    validate()
    src = APP.read_text(encoding="utf-8")
    start = src.index("const DISCOURSE = [")
    end = src.index("\n];", start) + len("\n];")
    block = src[start:end]
    added = "\n".join(passage_to_js(p) for p in NEW)
    new_block = block[: -len("];")] + added + "\n];"
    APP.write_text(src[:start] + new_block + src[end:], encoding="utf-8")
    print("inseridos:", len(NEW), "textos")


if __name__ == "__main__":
    main()
