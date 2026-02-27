defmodule LiveBettingWeb.SettlementLive.Form do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting
  alias LiveBetting.Betting.Settlement

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        {@page_title}
        <:subtitle>Use this form to manage settlement records in your database.</:subtitle>
      </.header>

      <.form for={@form} id="settlement-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:total_pool]} type="number" label="Total pool" step="any" />
        <.input field={@form[:house_cut]} type="number" label="House cut" step="any" />
        <.input field={@form[:distributable_pool]} type="number" label="Distributable pool" step="any" />
        <.input field={@form[:outcome]} type="text" label="Outcome" />
        <.input field={@form[:settled_at]} type="datetime-local" label="Settled at" />
        <footer>
          <.button phx-disable-with="Saving..." variant="primary">Save Settlement</.button>
          <.button navigate={return_path(@return_to, @settlement)}>Cancel</.button>
        </footer>
      </.form>
    </Layouts.app>
    """
  end

  @impl true
  def mount(params, _session, socket) do
    {:ok,
     socket
     |> assign(:return_to, return_to(params["return_to"]))
     |> apply_action(socket.assigns.live_action, params)}
  end

  defp return_to("show"), do: "show"
  defp return_to(_), do: "index"

  defp apply_action(socket, :edit, %{"id" => id}) do
    settlement = Betting.get_settlement!(id)

    socket
    |> assign(:page_title, "Edit Settlement")
    |> assign(:settlement, settlement)
    |> assign(:form, to_form(Betting.change_settlement(settlement)))
  end

  defp apply_action(socket, :new, _params) do
    settlement = %Settlement{}

    socket
    |> assign(:page_title, "New Settlement")
    |> assign(:settlement, settlement)
    |> assign(:form, to_form(Betting.change_settlement(settlement)))
  end

  @impl true
  def handle_event("validate", %{"settlement" => settlement_params}, socket) do
    changeset = Betting.change_settlement(socket.assigns.settlement, settlement_params)
    {:noreply, assign(socket, form: to_form(changeset, action: :validate))}
  end

  def handle_event("save", %{"settlement" => settlement_params}, socket) do
    save_settlement(socket, socket.assigns.live_action, settlement_params)
  end

  defp save_settlement(socket, :edit, settlement_params) do
    case Betting.update_settlement(socket.assigns.settlement, settlement_params) do
      {:ok, settlement} ->
        {:noreply,
         socket
         |> put_flash(:info, "Settlement updated successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, settlement))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp save_settlement(socket, :new, settlement_params) do
    case Betting.create_settlement(settlement_params) do
      {:ok, settlement} ->
        {:noreply,
         socket
         |> put_flash(:info, "Settlement created successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, settlement))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp return_path("index", _settlement), do: ~p"/settlements"
  defp return_path("show", settlement), do: ~p"/settlements/#{settlement}"
end
